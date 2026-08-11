# TrueNAS Community Widgets

Add widgets to the **TrueNAS SCALE dashboard** — weather, monitoring, and homelab service
integrations (Pi-hole, *arr, Plex/Jellyfin, Portainer, Proxmox, …). A small Docker app
(**the Hub**) hosts a widget store; widgets render inside the native dashboard cards.

> ⚠️ **Beta + unsupported appliance modification.** Widgets run JS in your TrueNAS admin
> session and the install patches the WebUI nginx. **Read [SECURITY.md](SECURITY.md) and
> [INSTALL.md](INSTALL.md) before installing.** Tested on TrueNAS SCALE **25.10.x** and **26.0 (BETA)**.

## Install
```sh
git clone https://github.com/madninjaskillz/truenas-community-widgets.git
cd truenas-community-widgets && sudo sh host/install.sh
```
Then hard-refresh the WebUI. See **[INSTALL.md](INSTALL.md)** for details and uninstall.

## Repo layout
- `widgets/<id>/` — the widget **catalog**: `metadata.json`, `README.md`, `src/`, built
  `<id>-<version>.zip`. `catalog.json` (discovery index, per-zip `sha256`) is built by
  `build_catalog.py`; CI **validates** it on every push.
- `hub/` — the **Widget Hub** app (stdlib Python server, client SDK/loader, Dockerfile);
  CI builds + publishes the image to `ghcr.io/madninjaskillz/cw-hub`.
- `host/` — `install.sh` / `uninstall.sh` and the WebUI nginx shim units.

## Authoring a widget

## Using this catalog
Point the Hub at it: set `CW_CATALOG_URL` to
`https://raw.githubusercontent.com/<owner>/<repo>/main/catalog.json`.

## Authoring a widget
Create `widgets/<your-id>/`:

```
widgets/my-widget/
  metadata.json     # id, name, version, client, optional producer + config
  README.md
  src/
    client.js       # calls CW.register("my-widget", mount)
    producer.py     # optional: long-running, writes JSON to $CW_OUT
```

**`metadata.json`** (see `schema/metadata.schema.json`):
```json
{
  "id": "my-widget", "name": "My Widget", "version": "1.0.0",
  "client": "client.js",
  "supportedSizes": ["quarter", "half", "full"],
  "producer": { "cmd": ["python3", "producer.py"], "interval": 5, "outputs": ["data.json"] },
  "config": { "color": { "type": "string", "default": "#4aa8ff" } },
  "permissions": ["nvidia", "hwmon"]
}
```

**`client.js`** — registers a mount function; renders into the native card:
```js
CW.register("my-widget", function (el, ctx) {
  CW.poll(function () {
    return ctx.data("data.json").then(function (d) { el.textContent = d.value; });
  }, 5000);
  // ctx: instanceId, data(file), getConfig()/saveConfig(obj), dataUrl(file)
  // helpers: CW.h, CW.style, CW.sparkline(arr,{lo,hi,color}), CW.poll(fn,ms)
  return function cleanup() {/* optional */};
});
```

**`producer.py`** (optional) — runs in the Hub container, writes outputs to `$CW_OUT`:
```python
import os, json, time
out = os.path.join(os.environ["CW_OUT"], "data.json")
while True:
    json.dump({"value": 42}, open(out, "w")); time.sleep(int(os.environ.get("CW_INTERVAL", "5")))
```

Run `python build_catalog.py` to (re)build your zip and update `catalog.json`, commit
both, and open a PR. CI **validates** metadata + that each `catalog.json` sha256 matches
the committed zip (it does not rebuild), so always run the builder before committing.
