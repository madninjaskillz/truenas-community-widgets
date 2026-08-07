#!/usr/bin/env python3
"""network-interfaces producer.

Reads real host NIC state (link state + negotiated speed) from sysfs. The Hub
container isn't on host networking, so its own /sys/class/net only shows the
container's virtual interfaces -- app-compose.yaml bind-mounts the host's
/sys/class/net read-only at /host-sys-class-net so this sees the real NICs
instead. Falls back to the container's own /sys/class/net (for local testing)
if that mount isn't present. Writes $CW_OUT/stats.json.
"""
import json, os, tempfile, time

OUT_DIR  = os.environ.get("CW_OUT", "/tmp")
OUT      = os.path.join(OUT_DIR, "stats.json")
INTERVAL = int(os.environ.get("CW_INTERVAL", "10"))
NET_DIR  = "/host-sys-class-net" if os.path.isdir("/host-sys-class-net") else "/sys/class/net"

def read(path):
    try:
        with open(path) as f: return f.read().strip()
    except Exception:
        return None

def sample():
    try: names = sorted(os.listdir(NET_DIR))
    except Exception: names = []
    out = []
    for name in names:
        if name == "lo": continue
        base = os.path.join(NET_DIR, name)
        state = read(os.path.join(base, "operstate")) or "unknown"
        physical = os.path.exists(os.path.join(base, "device"))
        speed = None
        if state == "up":
            raw = read(os.path.join(base, "speed"))
            try:
                v = int(raw)
                if v > 0: speed = v
            except (TypeError, ValueError):
                pass
        out.append({"name": name, "state": state, "physical": physical, "speed_mbps": speed})
    return out

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    while True:
        doc = {"updated": int(time.time()), "source": NET_DIR, "interfaces": sample()}
        fd, tmp = tempfile.mkstemp(dir=OUT_DIR)
        with os.fdopen(fd, "w") as f: json.dump(doc, f, separators=(",", ":"))
        os.chmod(tmp, 0o644); os.replace(tmp, OUT)
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
