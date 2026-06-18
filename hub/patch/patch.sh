#!/bin/sh
# CW host-shim nginx patcher. Shipped by the Widget Hub container, fetched and run
# on the HOST by cw-nginx.service whenever /etc/nginx/nginx.conf changes. Idempotent:
# adds a same-origin /cw/ proxy to the hub (127.0.0.1:35200) and injects the loader
# <script> into the WebUI shell. Tests config and reverts on failure.
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
TARGETS = ["location @index {", "location = /ui/ {"]

src = open(CONF).read()
if MARK in src:
    print("cw: already patched"); sys.exit(0)
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
shutil.copy2(CONF, CONF + ".cwbak")
open(CONF, "w").write("".join(out))
t = subprocess.run(["nginx", "-t"], capture_output=True, text=True)
if t.returncode != 0:
    shutil.copy2(CONF + ".cwbak", CONF)
    sys.stderr.write("cw: nginx -t failed, reverted:\n" + t.stderr); sys.exit(1)
r = subprocess.run(["nginx", "-s", "reload"], capture_output=True, text=True)
if r.returncode != 0:
    subprocess.run(["systemctl", "reload", "nginx"])
print("cw: patched & reloaded")
PY
