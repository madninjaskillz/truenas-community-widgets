# Security & trust model — read before installing

Community Widgets adds widgets to the TrueNAS dashboard by **injecting JavaScript into
the TrueNAS WebUI** and running a small **Docker app** ("the Hub") on your box. That is
powerful, and it has real security implications you must understand.

## What you are trusting
- **Widgets run as JavaScript inside the TrueNAS admin UI.** That means a widget's code
  runs with the **same privileges as your logged-in admin session** — it can call the
  TrueNAS API as you. **A malicious widget can fully compromise your NAS.** Only install
  widgets from a catalog you trust. The default catalog
  (`madninjaskillz/truenas-community-widgets`) is curated and PR-reviewed, and every
  package is pinned by `sha256` in `catalog.json`, but review is human and not a guarantee.
- **The Hub runs a server-side fetch proxy (`/cw/fetch`)** so widgets can reach APIs/LAN
  services with per-instance config. By default it is an **open proxy** (it will fetch any
  http/https URL, and does not verify TLS — many homelab services use self-signed certs).
  Anyone who can reach your TrueNAS WebUI origin can use it. Harden it via env:
  - `CW_FETCH_MODE=off` — disable the proxy entirely.
  - `CW_FETCH_MODE=allowlist` + `CW_FETCH_ALLOW=pi.hole,192.168.1.` — only allow listed hosts.
- **The WebUI nginx config is patched** (a `sub_filter` + a `/cw/` proxy location) by a
  small root-run script. This modifies a system-managed file; a TrueNAS update may revert
  it (a watcher re-applies it) or, in the worst case, change the WebUI so injection no
  longer fits. This is **unsupported by iX** — you are modifying the appliance.
- **Per-instance widget config (API keys, tokens) is stored in plaintext** in the Hub's
  data volume and passed through the proxy. Treat those keys accordingly.

## Scope / blast radius
- The Hub container binds **loopback only** (`127.0.0.1:35200`); it is reachable from the
  browser through the same-origin `/cw/` nginx route, not directly from the LAN.
- Removing everything: `sudo sh host/uninstall.sh` (un-patches nginx, removes the shim and
  the app). Add `--purge` to also delete the data volume.

## Recommended posture
- Run only on a TrueNAS box where **you are the sole admin**, on a trusted LAN.
- Install only **curated** widgets; read a widget's `src/` before installing if unsure.
- Set `CW_FETCH_MODE=allowlist` if you only use a few services.
- This is **beta** software and an **unsupported appliance modification** — do not run it
  on a production NAS holding irreplaceable data without backups.

## Reporting
Open an issue (or security advisory) on the GitHub repository.
