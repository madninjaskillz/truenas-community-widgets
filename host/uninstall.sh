#!/bin/sh
# Community Widgets — uninstaller. Run as root ON the TrueNAS box:
#   sudo sh host/uninstall.sh            # remove app + shim, keep the data volume
#   sudo sh host/uninstall.sh --purge    # also delete the app's data volume
set +e
[ "$(id -u)" = "0" ] || { echo "Please run as root"; exit 1; }
APP=cw-hub

echo "[CW] 1/3 removing the WebUI nginx shim"
systemctl disable --now cw-nginx.path cw-nginx.service 2>/dev/null
rm -f /etc/systemd/system/cw-nginx.path /etc/systemd/system/cw-nginx.service
systemctl daemon-reload

echo "[CW] 2/3 un-patching nginx.conf"
python3 - <<'PY'
import subprocess
CONF = "/etc/nginx/nginx.conf"
L = open(CONF).read().splitlines(keepends=True); out = []; i = 0; n = len(L)
while i < n:
    s = L[i].strip()
    if s == "# CW_INJECT location":
        i += 1
        while i < n and L[i].strip() != "}": i += 1
        i += 1
        if i < n and L[i].strip() == "": i += 1
        continue
    if s == "# CW_INJECT":
        i += 1
        while i < n and (L[i].strip().startswith("sub_filter") or "/cw/loader.js" in L[i]): i += 1
        continue
    out.append(L[i]); i += 1
open(CONF, "w").write("".join(out))
if subprocess.run(["nginx", "-t"], capture_output=True).returncode == 0:
    subprocess.run(["nginx", "-s", "reload"]); print("nginx un-patched + reloaded")
else:
    print("WARNING: nginx -t failed after un-patch; check /etc/nginx/nginx.conf")
PY

echo "[CW] 3/3 deleting the app"
if [ "$1" = "--purge" ]; then
  midclt call app.delete "$APP" '{"remove_ix_volumes": true, "remove_images": true}' >/dev/null 2>&1 || midclt call app.delete "$APP" >/dev/null 2>&1
  echo "[CW] app + data volume removed"
else
  midclt call app.delete "$APP" >/dev/null 2>&1
  echo "[CW] app removed (data volume kept; re-run with --purge to delete it)"
fi
echo "[CW] Done. Hard-refresh the WebUI."
