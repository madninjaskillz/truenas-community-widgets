#!/bin/sh
# Community Widgets — installer for TrueNAS SCALE 25.10.x. Run as root ON the TrueNAS box:
#   sudo sh host/install.sh
# Installs the Widget Hub app (from GHCR) + a small WebUI nginx shim. Pool-agnostic
# (app data lives in a docker named volume). Re-runnable. See SECURITY.md before use.
set -e
[ "$(id -u)" = "0" ] || { echo "Please run as root (sudo sh host/install.sh)"; exit 1; }
SRC="$(cd "$(dirname "$0")" && pwd)"
APP=cw-hub
command -v midclt >/dev/null || { echo "midclt not found — is this a TrueNAS SCALE box?"; exit 1; }

echo "[CW] 1/4 installing WebUI nginx shim (re-applies the /cw injection on nginx regen)"
install -m0644 "$SRC/cw-nginx.path"    /etc/systemd/system/cw-nginx.path
install -m0644 "$SRC/cw-nginx.service" /etc/systemd/system/cw-nginx.service
systemctl daemon-reload
systemctl enable --now cw-nginx.path

echo "[CW] 2/4 building the Hub image (cw-hub:local) from ./hub"
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
docker build -t cw-hub:local "$SRC/../hub" >/dev/null
COMPOSE="$SRC/app-compose.yaml"
if midclt call app.query "[[\"name\",\"=\",\"$APP\"]]" 2>/dev/null | grep -q "\"name\""; then
  python3 -c "import json;print(json.dumps({'custom_compose_config_string':open('$COMPOSE').read()}))" > /tmp/cw-payload.json
  midclt call app.update "$APP" "$(cat /tmp/cw-payload.json)" >/dev/null
else
  python3 -c "import json;print(json.dumps({'custom_app':True,'app_name':'$APP','custom_compose_config_string':open('$COMPOSE').read()}))" > /tmp/cw-payload.json
  midclt call app.create "$(cat /tmp/cw-payload.json)" >/dev/null
fi

echo "[CW] 3/4 waiting for the app to start (pulls the image on first run)..."
st=NONE
for i in $(seq 1 60); do
  st=$(midclt call app.query "[[\"name\",\"=\",\"$APP\"]]" 2>/dev/null | python3 -c 'import sys,json;a=json.load(sys.stdin);print(a[0]["state"] if a else "NONE")' 2>/dev/null)
  [ "$st" = "RUNNING" ] && break
  sleep 4
done
[ "$st" = "RUNNING" ] || { echo "[CW] app did not reach RUNNING (state=$st). Check the Apps page."; exit 1; }

echo "[CW] 4/4 applying WebUI injection + registering the Web UI portal"
systemctl start cw-nginx.service || true
sleep 2
midclt call app.metadata.generate >/dev/null 2>&1 || true

HOST=$(hostname -I 2>/dev/null | awk '{print $1}')
echo ""
echo "[CW] Done. Hard-refresh the TrueNAS WebUI (Ctrl-F5)."
echo "[CW]  • Store:   https://${HOST:-<truenas>}/cw/store   (also the app's 'Web UI' button)"
echo "[CW]  • Add a widget: Dashboard -> Configure -> Add -> Custom -> pick a widget"
echo "[CW] To remove everything later: sudo sh host/uninstall.sh"
