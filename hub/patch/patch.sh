#!/bin/sh
# CW host-shim nginx patcher. Shipped by the Widget Hub container, fetched and run
# on the HOST by cw-nginx.service whenever /etc/nginx/nginx.conf changes. Idempotent:
# adds a same-origin /cw/ proxy to the hub (127.0.0.1:35200) and injects the loader
# <script> into the WebUI shell. Re-runs strip any previous CW lines first, so an
# upgraded patch (e.g. new target blocks) converges instead of keeping the old shape.
# Tests config and reverts on failure.
python3 - <<'PY'
import subprocess, shutil, sys
CONF = "/etc/nginx/nginx.conf"
MARK = "# CW_INJECT"
LOC = ("        " + MARK + " location\n"
       "        location /cw/ {\n"
       "            allow all;\n"
       "            proxy_pass http://127.0.0.1:35200;\n"
       "            proxy_http_version 1.1;\n"
       "            proxy_set_header Host $host;\n"
       "            proxy_set_header X-Real-IP $remote_addr;\n"
       "            proxy_buffering off;\n"
       "        }\n\n")
# Every block that can serve the WebUI shell. 25.10 uses @index and "= /ui/";
# 26.0 adds a "= /ui/index.html" block that serves index.html directly. Only
# blocks actually present in the conf get patched, so one list covers both.
TARGETS = ["location @index {", "location = /ui/ {", "location = /ui/index.html {"]

orig = open(CONF).read()
# Strip any existing CW lines (same logic as the uninstaller) so re-running with a
# newer patch replaces the old injection rather than exiting at "already patched".
L = orig.splitlines(keepends=True); clean = []; i = 0; n = len(L)
while i < n:
    s = L[i].strip()
    if s == MARK + " location":
        i += 1
        while i < n and L[i].strip() != "}": i += 1
        i += 1
        if i < n and L[i].strip() == "": i += 1
        continue
    if s == MARK:
        i += 1
        while i < n and (L[i].strip().startswith("sub_filter") or "/cw/loader.js" in L[i]): i += 1
        continue
    clean.append(L[i]); i += 1
src = "".join(clean)
# sub_filter_once / sub_filter_types may appear only once per block. If another
# injector already declared them in the target blocks, only add our sub_filter line.
once_types = ("            sub_filter_once on;\n"
              "            sub_filter_types text/html;\n") if "sub_filter_once" not in src else ""
SUB = ("            " + MARK + "\n" + once_types +
       "            sub_filter '</body>' '<script src=\"/cw/loader.js\" defer></script></body>';\n")
out = []
for ln in src.splitlines(keepends=True):
    s = ln.strip()
    if s == "location @index {":
        out.append(LOC)
    out.append(ln)
    if s in TARGETS:
        out.append(SUB)
new = "".join(out)
if new == orig:
    print("cw: already patched"); sys.exit(0)
shutil.copy2(CONF, CONF + ".cwbak")
open(CONF, "w").write(new)
t = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
if t.returncode != 0:
    shutil.copy2(CONF + ".cwbak", CONF)
    sys.stderr.write("cw: nginx -t failed, reverted:\n" + t.stderr); sys.exit(1)
r = subprocess.run(["nginx", "-s", "reload"], capture_output=True, text=True)
if r.returncode != 0:
    subprocess.run(["systemctl", "reload", "nginx"])
print("cw: patched & reloaded")
PY
