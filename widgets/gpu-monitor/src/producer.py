#!/usr/bin/env python3
"""gpu-monitor producer — vendor-agnostic.

Primary source: nvidia-smi (rich metrics for supported NVIDIA GPUs).
Secondary source: Linux DRM sysfs (/sys/class/drm/card*) for AMD (amdgpu),
Intel (i915/xe) and nouveau-bound NVIDIA GPUs — temp always, plus VRAM/util/power/
clock where the driver exposes them. GPUs already covered by nvidia-smi (matched by
PCI bus id) are not duplicated. Also samples all nct6798 fans. Writes $CW_OUT/stats.json.
"""
import json, os, glob, subprocess, tempfile, time

OUT_DIR  = os.environ.get("CW_OUT", "/tmp")
OUT      = os.path.join(OUT_DIR, "stats.json")
INTERVAL = int(os.environ.get("CW_INTERVAL", "5"))
MAXPTS   = 360
FAN_HWMON = "nct6798"
VENDOR = {"0x10de": "NVIDIA", "0x1002": "AMD", "0x8086": "Intel"}

def ri(path):
    try: return int(open(path).read().strip())
    except Exception: return None

# ---------- nvidia-smi (rich) ----------
def norm_bus(b):
    p = (b or "").strip().lower().split(":")
    if len(p) == 3: p[0] = p[0][-4:].zfill(4)
    return ":".join(p)

def nvidia_list():
    try:
        out = subprocess.check_output(["nvidia-smi", "--query-gpu=index,name,pci.bus_id", "--format=csv,noheader"], timeout=8).decode().strip().splitlines()
        res = []
        for ln in out:
            a = [x.strip() for x in ln.split(",")]
            res.append((int(a[0]), a[1], norm_bus(a[2])))
        return res
    except Exception:
        return []

def nvidia_sample(idx):
    try:
        out = subprocess.check_output(["nvidia-smi", "-i", str(idx),
            "--query-gpu=memory.used,memory.total,temperature.gpu,power.draw,utilization.gpu,clocks.gr",
            "--format=csv,noheader,nounits"], timeout=8).decode().strip().splitlines()[0]
        a = [x.strip() for x in out.split(",")]
        return {"vram_used": int(float(a[0])), "vram_total": int(float(a[1])), "temp": int(float(a[2])),
                "power": round(float(a[3])), "util": int(float(a[4])), "clock": int(float(a[5]))}
    except Exception:
        return {"vram_used": None, "vram_total": None, "temp": None, "power": None, "util": None, "clock": None}

# ---------- DRM sysfs (vendor-agnostic) ----------
def parse_sclk(path):
    try:
        for ln in open(path):
            if ln.strip().endswith("*"):
                for tok in ln.replace("*", "").split():
                    t = tok.lower()
                    if t.endswith("mhz"): return int(float(t[:-3]))
                    if t.endswith("ghz"): return int(float(t[:-3]) * 1000)
    except Exception:
        pass
    return None

def sysfs_sample(card):
    d = os.path.join(card, "device")
    cur = {"vram_used": None, "vram_total": None, "temp": None, "power": None, "util": None, "clock": None}
    hws = glob.glob(os.path.join(d, "hwmon", "hwmon*"))
    if hws:
        t = ri(os.path.join(hws[0], "temp1_input"));   cur["temp"] = t // 1000 if t is not None else None
        p = ri(os.path.join(hws[0], "power1_average")); cur["power"] = round(p / 1e6) if p else None
        f = ri(os.path.join(hws[0], "freq1_input"));    cur["clock"] = round(f / 1e6) if f else None
    cur["util"] = ri(os.path.join(d, "gpu_busy_percent"))
    vu = ri(os.path.join(d, "mem_info_vram_used")); vt = ri(os.path.join(d, "mem_info_vram_total"))
    if vu is not None: cur["vram_used"] = vu // 1048576
    if vt is not None: cur["vram_total"] = vt // 1048576
    if cur["clock"] is None: cur["clock"] = parse_sclk(os.path.join(d, "pp_dpm_sclk"))
    return cur

def sysfs_list(skip_buses):
    out = []
    for card in sorted(glob.glob("/sys/class/drm/card[0-9]")):
        try:
            bus = os.path.basename(os.path.realpath(os.path.join(card, "device"))).lower()
            if bus in skip_buses: continue
            vid = (open(os.path.join(card, "device", "vendor")).read().strip())
            s = sysfs_sample(card)
            if all(v is None for v in s.values()): continue   # nothing readable -> skip
            name = "%s GPU (%s)" % (VENDOR.get(vid, vid), os.path.basename(card))
            out.append((os.path.basename(card), name, card))
        except Exception:
            pass
    return out

# ---------- build unified sources ----------
SOURCES = []   # {id, name, sample}
def build_sources():
    nv = nvidia_list(); nvbus = set()
    for idx, name, bus in nv:
        nvbus.add(bus)
        SOURCES.append({"id": idx, "name": name, "sample": (lambda i=idx: nvidia_sample(i))})
    if not nv:   # nvidia-smi absent -> still cover an nvidia DRM card via sysfs if any
        pass
    for cid, name, card in sysfs_list(nvbus):
        SOURCES.append({"id": cid, "name": name, "sample": (lambda c=card: sysfs_sample(c))})
    if not SOURCES:
        SOURCES.append({"id": 0, "name": "GPU 0", "sample": (lambda: nvidia_sample(0))})

# ---------- fans ----------
def hwmon_dir():
    for d in glob.glob("/sys/class/hwmon/hwmon*"):
        try:
            if open(os.path.join(d, "name")).read().strip() == FAN_HWMON: return d
        except OSError: pass
    return None
def discover_fans(hw):
    keys = []
    for f in sorted(glob.glob(os.path.join(hw, "fan*_input"))):
        try: int(open(f).read().strip()); keys.append(os.path.basename(f).replace("_input", ""))
        except Exception: pass
    return keys

build_sources()
HW = hwmon_dir()
FKEYS = discover_fans(HW) if HW else []
t_hist = []
gpu_hist = {str(s["id"]): {"vram": [], "temp": [], "power": [], "clock": []} for s in SOURCES}
fan_hist = {k: [] for k in FKEYS}

def load_existing():
    try:
        d = json.load(open(OUT))
        if isinstance(d.get("t"), list): t_hist[:] = d["t"][-MAXPTS:]
        for g in d.get("gpus", []):
            i = str(g.get("index"))
            if i in gpu_hist:
                for k in gpu_hist[i]:
                    v = g.get("history", {}).get(k)
                    if isinstance(v, list): gpu_hist[i][k] = v[-MAXPTS:]
        for fo in d.get("fans", []):
            k = fo.get("key")
            if k in fan_hist and isinstance(fo.get("history"), list): fan_hist[k] = fo["history"][-MAXPTS:]
    except Exception: pass

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    load_existing()
    while True:
        now = int(time.time()); t_hist.append(now); del t_hist[:-MAXPTS]
        gpus_out = []
        for s in SOURCES:
            cur = s["sample"](); h = gpu_hist[str(s["id"])]
            h["vram"].append(cur["vram_used"]); h["temp"].append(cur["temp"]); h["power"].append(cur["power"]); h["clock"].append(cur["clock"])
            for k in h: del h[k][:-MAXPTS]
            gpus_out.append({"index": s["id"], "name": s["name"], "current": cur, "history": h})
        fans_out = []
        for k in FKEYS:
            rpm = ri(os.path.join(HW, k + "_input")); fan_hist[k].append(rpm); del fan_hist[k][:-MAXPTS]
            fans_out.append({"key": k, "current": rpm, "label": "%s (%s rpm)" % (k, rpm if rpm is not None else "-"), "history": fan_hist[k]})
        doc = {"updated": now, "t": t_hist, "gpus": gpus_out, "fans": fans_out}
        fd, tmp = tempfile.mkstemp(dir=OUT_DIR)
        with os.fdopen(fd, "w") as f: json.dump(doc, f, separators=(",", ":"))
        os.chmod(tmp, 0o644); os.replace(tmp, OUT)
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
