#!/usr/bin/env python3
"""gpu-monitor producer. Samples all NVIDIA GPUs + all non-zero nct6798 fans and
writes $CW_OUT/stats.json every CW_INTERVAL seconds. Runs inside the Hub container
(nvidia-smi via the nvidia runtime; fans via the auto-mounted /sys/class/hwmon)."""
import json, os, glob, subprocess, tempfile, time

OUT_DIR  = os.environ.get("CW_OUT", "/tmp")
OUT      = os.path.join(OUT_DIR, "stats.json")
INTERVAL = int(os.environ.get("CW_INTERVAL", "5"))
MAXPTS   = 360
FAN_HWMON = "nct6798"

def hwmon_dir():
    for d in glob.glob("/sys/class/hwmon/hwmon*"):
        try:
            if open(os.path.join(d, "name")).read().strip() == FAN_HWMON:
                return d
        except OSError:
            pass
    return None

def list_gpus():
    try:
        out = subprocess.check_output(["nvidia-smi", "--query-gpu=index,name", "--format=csv,noheader"], timeout=8).decode().strip().splitlines()
        return [(int(i.split(",")[0]), i.split(",", 1)[1].strip()) for i in out] or [(0, "GPU 0")]
    except Exception:
        return [(0, "GPU 0")]

def gpu_sample(idx):
    try:
        out = subprocess.check_output(["nvidia-smi", "-i", str(idx),
            "--query-gpu=memory.used,memory.total,temperature.gpu,power.draw,utilization.gpu,clocks.gr",
            "--format=csv,noheader,nounits"], timeout=8).decode().strip().splitlines()[0]
        a = [x.strip() for x in out.split(",")]
        return {"vram_used": int(float(a[0])), "vram_total": int(float(a[1])), "temp": int(float(a[2])),
                "power": round(float(a[3])), "util": int(float(a[4])), "clock": int(float(a[5]))}
    except Exception:
        return {"vram_used": None, "vram_total": None, "temp": None, "power": None, "util": None, "clock": None}

def discover_fans(hw):
    keys = []
    for f in sorted(glob.glob(os.path.join(hw, "fan*_input"))):
        try:
            if int(open(f).read().strip()) > 0:
                keys.append(os.path.basename(f).replace("_input", ""))
        except Exception:
            pass
    return keys

def read_fan(hw, key):
    try:
        return int(open(os.path.join(hw, key + "_input")).read().strip())
    except Exception:
        return None

GPUS = list_gpus()
HW = hwmon_dir()
FKEYS = discover_fans(HW) if HW else []
t_hist = []
gpu_hist = {idx: {"vram": [], "temp": [], "power": [], "clock": []} for idx, _ in GPUS}
fan_hist = {k: [] for k in FKEYS}

def load_existing():
    try:
        d = json.load(open(OUT))
        if isinstance(d.get("t"), list):
            t_hist[:] = d["t"][-MAXPTS:]
        for g in d.get("gpus", []):
            i = g.get("index")
            if i in gpu_hist:
                for k in gpu_hist[i]:
                    v = g.get("history", {}).get(k)
                    if isinstance(v, list): gpu_hist[i][k] = v[-MAXPTS:]
        for fo in d.get("fans", []):
            k = fo.get("key")
            if k in fan_hist and isinstance(fo.get("history"), list): fan_hist[k] = fo["history"][-MAXPTS:]
    except Exception:
        pass

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    load_existing()
    while True:
        now = int(time.time())
        t_hist.append(now); del t_hist[:-MAXPTS]
        gpus_out = []
        for idx, name in GPUS:
            s = gpu_sample(idx); h = gpu_hist[idx]
            h["vram"].append(s["vram_used"]); h["temp"].append(s["temp"])
            h["power"].append(s["power"]); h["clock"].append(s["clock"])
            for k in h: del h[k][:-MAXPTS]
            gpus_out.append({"index": idx, "name": name, "current": s, "history": h})
        fans_out = []
        for k in FKEYS:
            rpm = read_fan(HW, k); fan_hist[k].append(rpm); del fan_hist[k][:-MAXPTS]
            fans_out.append({"key": k, "current": rpm, "history": fan_hist[k]})
        doc = {"updated": now, "t": t_hist, "gpus": gpus_out, "fans": fans_out}
        fd, tmp = tempfile.mkstemp(dir=OUT_DIR)
        with os.fdopen(fd, "w") as f:
            json.dump(doc, f, separators=(",", ":"))
        os.chmod(tmp, 0o644)
        os.replace(tmp, OUT)
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
