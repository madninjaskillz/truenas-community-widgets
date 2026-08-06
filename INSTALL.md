# Installing Community Widgets

> ⚠️ Beta software that **modifies the TrueNAS WebUI** and runs JS from installed widgets
> in your admin session. **Read [SECURITY.md](SECURITY.md) first.**

## Requirements
- **TrueNAS SCALE 25.10.x** (built and tested on 25.10.4; other versions may not work —
  the WebUI injection is version-specific).
- Apps (Docker) enabled, with internet access (to pull the `python:3.12-slim` base image
  when building the Hub, and to reach `raw.githubusercontent.com` for the catalog and
  in-UI Hub updates).
- Root/SSH access to the box.

## Install
1. SSH to the TrueNAS box and clone this repo (or copy the `host/` folder over):
   ```sh
   git clone https://github.com/madninjaskillz/truenas-community-widgets.git
   cd truenas-community-widgets
   ```
2. Run the installer as root:
   ```sh
   sudo sh host/install.sh
   ```
   It builds the Hub image locally from `hub/`, creates the **cw-hub** app, installs the
   WebUI nginx shim, and registers the store's Web UI button. (A prebuilt image is also
   published at `ghcr.io/madninjaskillz/cw-hub` if you'd rather pull than build — see the
   comment in `host/app-compose.yaml`.)
3. **Hard-refresh** the WebUI (Ctrl-F5).

## Using it
- Open the **Widget Store**: the `cw-hub` app's **Web UI** button, the **🧩 Widget Store**
  button on the dashboard (bottom-right), or `https://<truenas>/cw/store`.
- **Install** widgets from the store, then add one: **Dashboard → Configure → Add →
  Category: Custom → pick your widget** (it appears in the Widget Type dropdown).
- Each placed widget has a **⚙ gear** for per-instance settings; the same settings also
  appear inline while adding/editing.

## Hardening (optional)
Edit the `cw-hub` app (or `host/app-compose.yaml`) env:
- `CW_FETCH_MODE=off` — disable the server-side fetch proxy.
- `CW_FETCH_MODE=allowlist` and `CW_FETCH_ALLOW=pi.hole,192.168.1.` — restrict it.

## Update
- **Widgets** update from the store (Discover → Update).
- **The Hub's frontend** (`loader.js`/`lib.js`/`store.html`): click **Check for Hub
  Update** on the Widget Store page. It fetches those three files from `CW_HUB_SOURCE_URL`
  (default: this repo's `main`), stages any that changed on the Hub's data volume, and
  serves them immediately — no rebuild, no restart, just reload the page. Use **Reset to
  bundled** on the same page to drop the staged copies and go back to what shipped in the
  image.
- **The Hub's backend** (`hub/server.py`, `Dockerfile`, anything the button above can't
  reach): `git pull` then `sudo sh host/install.sh` again (rebuilds and redeploys).
- After a **TrueNAS OS upgrade**, re-run `sudo sh host/install.sh` (an OS upgrade wipes
  `/etc` customizations).

## Uninstall
```sh
sudo sh host/uninstall.sh           # remove app + WebUI shim, keep data
sudo sh host/uninstall.sh --purge   # also delete the data volume
```

## Troubleshooting
- **Widgets/picker don't appear:** your TrueNAS WebUI version likely differs — check the
  browser console for `[CW] ... your WebUI version may differ`.
- **Store button works but widgets won't load:** confirm the app is RUNNING (Apps page)
  and `https://<truenas>/cw/manifest.json` returns JSON.
- **Service-integration widget shows "configure me" or an error:** set its URL/API key in
  the gear; remember **host services need the box's LAN IP, not 127.0.0.1** (the proxy
  runs in the container).
