#!/usr/bin/env python3
"""CW Widget Hub — dependency-free stdlib HTTP server + widget lifecycle.

Serves everything under /cw/* (the host nginx proxy_passes /cw/ here):
  GET  /cw/manifest.json        installed widgets (loader + picker)
  GET  /cw/loader.js /cw/lib.js injected loader + client SDK
  GET  /cw/patch/patch.sh       host-shim patch script
  GET  /cw/w/{id}/<path>        widget client assets
  GET  /cw/data/{id}/<file>     producer outputs
  GET|PUT /cw/config/{iid}      per-instance config
  GET  /cw/catalog              Discover list (catalog + installed/version info)
  POST /cw/store/install|update|remove   {"id": "..."}  lifecycle
  GET  /cw/devcatalog/<path>    bundled dev catalog (zips + catalog.json)
  GET  /cw/ /cw/store           store UI

Widget catalog: CW_CATALOG_URL (file path or http[s] URL to a catalog.json). Default
is a self-generated dev catalog under $CW_DATA/devcatalog built from /app/builtin/*.
Producers: each installed widget with metadata.producer is run as a long-lived,
auto-restarting process (cwd=widget dir, env CW_OUT=its out/ dir); start/stop on
install/remove without restarting the hub.
"""
import json, os, re, threading, subprocess, time, shutil, posixpath, zipfile, hashlib, io
import urllib.request, urllib.error, urllib.parse, ssl, socket, datetime, ipaddress
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP_DIR    = os.path.dirname(os.path.abspath(__file__))
CLIENT_DIR = os.path.join(APP_DIR, "client")
PATCH_DIR  = os.path.join(APP_DIR, "patch")
SRC        = os.path.join(APP_DIR, "builtin")        # bundled widget sources
DATA_DIR   = os.environ.get("CW_DATA", "/data")
WIDGETS    = os.path.join(DATA_DIR, "widgets")
CONFIGS    = os.path.join(DATA_DIR, "config")
DEVCAT     = os.path.join(DATA_DIR, "devcatalog")
PORT       = int(os.environ.get("CW_PORT", "8080"))
SEED       = ["gpu-monitor"]                         # pre-installed on first run
CATALOG_URL = os.environ.get("CW_CATALOG_URL", os.path.join(DEVCAT, "catalog.json"))
# /cw/fetch security: "open" (default), "off" (disable), or "allowlist" (CW_FETCH_ALLOW = comma host substrings)
FETCH_MODE  = os.environ.get("CW_FETCH_MODE", "open").lower()
FETCH_ALLOW = [x.strip().lower() for x in os.environ.get("CW_FETCH_ALLOW", "").split(",") if x.strip()]
FETCH_TLS_VERIFY = os.environ.get("CW_FETCH_TLS_VERIFY", "0") == "1"   # homelab services are often self-signed
FETCH_MAX_BYTES  = int(os.environ.get("CW_FETCH_MAX_BYTES", "4194304"))  # 4 MiB response cap
FETCH_BLOCK_HOSTS = {"169.254.169.254", "metadata.google.internal", "metadata.goog"}  # cloud metadata

MIME = {".js":"application/javascript",".json":"application/json",".css":"text/css",".svg":"image/svg+xml",
        ".html":"text/html",".png":"image/png",".sh":"text/x-shellscript",".txt":"text/plain",".zip":"application/zip"}
SAFE = re.compile(r"^[A-Za-z0-9._-]+$")

def mime_for(p): return MIME.get(os.path.splitext(p)[1].lower(), "application/octet-stream")
def ensure_dirs():
    for d in (WIDGETS, CONFIGS, DEVCAT): os.makedirs(d, exist_ok=True)
def load_meta_dir(d):
    try:
        with open(os.path.join(d, "metadata.json")) as f: return json.load(f)
    except Exception: return None
def load_meta(wid): return load_meta_dir(os.path.join(WIDGETS, wid))
def installed_ids():
    if not os.path.isdir(WIDGETS): return []
    return [d for d in sorted(os.listdir(WIDGETS)) if os.path.isfile(os.path.join(WIDGETS, d, "metadata.json"))]

def build_manifest():
    out = []
    for wid in installed_ids():
        m = load_meta(wid) or {}
        out.append({"id": m.get("id", wid), "name": m.get("name", wid), "version": m.get("version", "0"),
                    "description": m.get("description", ""),
                    "icon": ("/cw/w/%s/%s" % (wid, m["icon"])) if m.get("icon") else None,
                    "client": "/cw/w/%s/%s" % (wid, m.get("client", "client.js")),
                    "supportedSizes": m.get("supportedSizes", ["quarter", "half", "full"]),
                    "config": m.get("config", {})})
    return {"widgets": out}

# ---------------- dev catalog (zip bundled sources) ----------------
def build_dev_catalog():
    if not os.path.isdir(SRC): return
    widgets = []
    for wid in sorted(os.listdir(SRC)):
        sdir = os.path.join(SRC, wid)
        m = load_meta_dir(sdir)
        if not m: continue
        ver = m.get("version", "0")
        zname = "%s-%s.zip" % (wid, ver)
        zpath = os.path.join(DEVCAT, zname)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for root, _, files in os.walk(sdir):
                for fn in files:
                    fp = os.path.join(root, fn)
                    z.write(fp, os.path.relpath(fp, sdir))
        data = buf.getvalue()
        with open(zpath, "wb") as f: f.write(data)
        widgets.append({"id": m.get("id", wid), "name": m.get("name", wid), "version": ver,
                        "description": m.get("description", ""), "author": m.get("author", ""),
                        "supportedSizes": m.get("supportedSizes", ["quarter", "half", "full"]),
                        "permissions": m.get("permissions", []),
                        "zip": zname, "sha256": hashlib.sha256(data).hexdigest()})
    with open(os.path.join(DEVCAT, "catalog.json"), "w") as f:
        json.dump({"version": 1, "widgets": widgets}, f)

def seed():
    for wid in SEED:
        s, d = os.path.join(SRC, wid), os.path.join(WIDGETS, wid)
        if os.path.isdir(s) and not os.path.exists(d): shutil.copytree(s, d)

# ---------------- catalog + lifecycle ----------------
def _read(url):
    if url.startswith("http://") or url.startswith("https://"):
        with urllib.request.urlopen(url, timeout=20) as r: return r.read()
    with open(url, "rb") as f: return f.read()
def catalog_fetch():
    return json.loads(_read(CATALOG_URL))
def resolve_zip(entry):
    z = entry["zip"]
    return z if z.startswith("http") else (CATALOG_URL.rsplit("/", 1)[0] + "/" + z)

def install(wid):
    cat = catalog_fetch()
    entry = next((w for w in cat.get("widgets", []) if w.get("id") == wid), None)
    if not entry: raise ValueError("not in catalog: " + wid)
    data = _read(resolve_zip(entry))
    if entry.get("sha256") and hashlib.sha256(data).hexdigest() != entry["sha256"]:
        raise ValueError("sha256 mismatch for " + wid)
    dst = os.path.join(WIDGETS, wid)
    stop_producer(wid)
    tmp = dst + ".new"
    if os.path.exists(tmp): shutil.rmtree(tmp)
    os.makedirs(tmp, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for n in z.namelist():
            if n.startswith("/") or ".." in n.split("/"): raise ValueError("unsafe path in zip")
        z.extractall(tmp)
    if not os.path.isfile(os.path.join(tmp, "metadata.json")): raise ValueError("zip missing metadata.json")
    if os.path.exists(dst): shutil.rmtree(dst)
    os.replace(tmp, dst)
    start_producer(wid)
    return load_meta(wid)

def remove(wid):
    stop_producer(wid)
    dst = os.path.join(WIDGETS, wid)
    if os.path.exists(dst): shutil.rmtree(dst)

def discover():
    try: cat = catalog_fetch()
    except Exception as e: return {"widgets": [], "error": str(e)}
    inst = {wid: (load_meta(wid) or {}).get("version") for wid in installed_ids()}
    for w in cat.get("widgets", []):
        w["installed"] = w["id"] in inst
        w["installedVersion"] = inst.get(w["id"])
        w["updatable"] = w["installed"] and inst.get(w["id"]) != w.get("version")
    return cat

# ---------------- producer supervisor (dynamic) ----------------
_stop_all = threading.Event()
_prod = {}   # wid -> threading.Event (per-producer stop)

def _run_producer(wid, meta, ev):
    wdir = os.path.join(WIDGETS, wid); out = os.path.join(wdir, "out"); os.makedirs(out, exist_ok=True)
    env = dict(os.environ, CW_OUT=out, CW_WIDGET_DIR=wdir, CW_INTERVAL=str(meta["producer"].get("interval", 5)))
    backoff = 2
    while not ev.is_set() and not _stop_all.is_set():
        try:
            p = subprocess.Popen(meta["producer"]["cmd"], cwd=wdir, env=env)
            while p.poll() is None and not ev.is_set() and not _stop_all.is_set(): time.sleep(1)
            if ev.is_set() or _stop_all.is_set(): p.terminate(); break
            backoff = min(backoff * 2, 60)
        except Exception:
            backoff = min(backoff * 2, 60)
        for _ in range(backoff):
            if ev.is_set() or _stop_all.is_set(): break
            time.sleep(1)

def start_producer(wid):
    m = load_meta(wid)
    if not (m and isinstance(m.get("producer"), dict) and m["producer"].get("cmd")): return
    if wid in _prod: return
    ev = threading.Event(); _prod[wid] = ev
    threading.Thread(target=_run_producer, args=(wid, m, ev), daemon=True).start()

def stop_producer(wid):
    ev = _prod.pop(wid, None)
    if ev: ev.set()

def start_all():
    for wid in installed_ids(): start_producer(wid)

# ---------------- widget data helpers (proxy + cert) ----------------
def fetch_guard(url):
    """Returns an error string if the URL must not be fetched, else None. SSRF guard:
    blocks loopback (the Hub's own control plane), link-local and cloud metadata; private
    LAN stays allowed for homelab services."""
    if not (url.startswith("http://") or url.startswith("https://")):
        return "only http(s) URLs allowed"
    if FETCH_MODE == "off":
        return "proxy disabled (CW_FETCH_MODE=off)"
    host = (urllib.parse.urlparse(url).hostname or "").lower()
    if FETCH_MODE == "allowlist" and not any(a in host for a in FETCH_ALLOW):
        return "host not allowed (CW_FETCH_ALLOW)"
    if host in FETCH_BLOCK_HOSTS:
        return "blocked host"
    try:
        for info in socket.getaddrinfo(host, None):
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_loopback or ip.is_link_local:
                return "blocked address (loopback/link-local)"
    except Exception:
        pass
    return None

def _ssl_ctx():
    ctx = ssl.create_default_context()
    if not FETCH_TLS_VERIFY:
        ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    return ctx

def proxy_fetch(o):
    """Server-side fetch so widget clients can hit APIs/services with per-instance
    config (no browser CORS; secrets stay same-origin). http/https only, SSRF-guarded."""
    url = (o or {}).get("url", "")
    err = fetch_guard(url)
    if err:
        return {"error": err}
    method = (o.get("method") or "GET").upper()
    headers = o.get("headers") or {}
    data = o.get("body")
    if isinstance(data, str):
        data = data.encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=12, context=_ssl_ctx()) as r:
            return {"status": r.status, "body": r.read(FETCH_MAX_BYTES).decode("utf-8", "replace"), "headers": dict(r.getheaders())}
    except urllib.error.HTTPError as e:
        return {"status": e.code, "body": e.read(FETCH_MAX_BYTES).decode("utf-8", "replace"), "headers": dict(e.headers)}
    except Exception as e:
        return {"error": str(e)[:200]}

def img_fetch(url, auth=None):
    """Binary image passthrough (camera snapshots) so widgets can <img src> a same-origin
    HTTPS URL instead of a blocked mixed-content / cross-origin one. SSRF-guarded."""
    if fetch_guard(url):
        return None
    headers = {"User-Agent": "cw-hub"}
    if auth:
        headers["Authorization"] = auth
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=12, context=_ssl_ctx()) as r:
        return r.read(FETCH_MAX_BYTES), (r.headers.get("Content-Type") or "image/jpeg")

def cert_info(host, port=443):
    if not host:
        return {"error": "no host"}
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, port), timeout=8) as s:
            with ctx.wrap_socket(s, server_hostname=host) as ss:
                cert = ss.getpeercert()
        na = cert.get("notAfter")
        exp = datetime.datetime.strptime(na, "%b %d %H:%M:%S %Y %Z")
        days = (exp - datetime.datetime.utcnow()).days
        subj = dict(x[0] for x in cert.get("subject", []))
        return {"host": host, "notAfter": na, "daysLeft": days, "subject": subj.get("commonName", host)}
    except Exception as e:
        return {"error": str(e)[:200]}

# ---------------- HTTP ----------------
class H(BaseHTTPRequestHandler):
    server_version = "cw-hub/0.2"
    def log_message(self, *a): pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD": self.wfile.write(body)

    def _file(self, path):
        if not os.path.isfile(path): return self._json(404, {"error": "not found"})
        with open(path, "rb") as f: data = f.read()
        self.send_response(200); self.send_header("Content-Type", mime_for(path))
        self.send_header("Content-Length", str(len(data))); self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD": self.wfile.write(data)

    def _img(self, url, auth):
        try:
            res = img_fetch(url, auth)
        except Exception as e:
            return self._json(502, {"error": str(e)[:120]})
        if not res:
            return self._json(400, {"error": "blocked or invalid url"})
        data, ct = res
        self.send_response(200)
        self.send_header("Content-Type", ct)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _stream(self, url, auth):
        # Streaming passthrough (e.g. Frigate MJPEG) — same-origin so an <img> can render it
        # live without mixed-content/CORS. One worker thread per active stream.
        if fetch_guard(url):
            return self._json(400, {"error": "blocked or invalid url"})
        headers = {"User-Agent": "cw-hub"}
        if auth:
            headers["Authorization"] = auth
        try:
            up = urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15, context=_ssl_ctx())
        except Exception as e:
            return self._json(502, {"error": str(e)[:120]})
        self.send_response(200)
        self.send_header("Content-Type", up.headers.get("Content-Type") or "multipart/x-mixed-replace")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            while True:
                chunk = up.read(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
        except Exception:
            pass
        finally:
            try: up.close()
            except Exception: pass

    def _parts(self):
        p = self.path.split("?", 1)[0]
        if p == "/cw" or p == "/cw/": return []
        if not p.startswith("/cw/"): return None
        return [s for s in p[4:].split("/") if s != ""]

    def _safe_join(self, root, segs):
        rel = posixpath.normpath("/".join(segs)).lstrip("/")
        if rel.startswith("..") or rel == ".": return None
        return os.path.join(root, rel)

    def do_GET(self):
        parts = self._parts()
        if parts is None: return self._json(404, {"error": "not cw"})
        if not parts or parts[0] in ("store", "index.html"): return self._file(os.path.join(CLIENT_DIR, "store.html"))
        head = parts[0]
        if head == "manifest.json": return self._json(200, build_manifest())
        if head == "catalog": return self._json(200, discover())
        if head == "cert":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            return self._json(200, cert_info((q.get("host") or [""])[0], int((q.get("port") or ["443"])[0])))
        if head == "img":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            return self._img((q.get("url") or [""])[0], (q.get("auth") or [None])[0])
        if head == "stream":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            return self._stream((q.get("url") or [""])[0], (q.get("auth") or [None])[0])
        if head == "loader.js": return self._file(os.path.join(CLIENT_DIR, "loader.js"))
        if head == "lib.js": return self._file(os.path.join(CLIENT_DIR, "lib.js"))
        if head == "patch" and parts[1:] == ["patch.sh"]: return self._file(os.path.join(PATCH_DIR, "patch.sh"))
        if head == "devcatalog" and len(parts) >= 2:
            fp = self._safe_join(DEVCAT, parts[1:]); return self._file(fp) if fp else self._json(400, {"error": "bad path"})
        if head == "w" and len(parts) >= 3 and SAFE.match(parts[1]):
            fp = self._safe_join(os.path.join(WIDGETS, parts[1]), parts[2:]); return self._file(fp) if fp else self._json(400, {"error": "bad path"})
        if head == "data" and len(parts) == 3 and SAFE.match(parts[1]) and SAFE.match(parts[2]):
            return self._file(os.path.join(WIDGETS, parts[1], "out", parts[2]))
        if head == "config" and len(parts) == 2 and SAFE.match(parts[1]):
            fp = os.path.join(CONFIGS, parts[1] + ".json")
            return self._file(fp) if os.path.isfile(fp) else self._json(200, {})
        return self._json(404, {"error": "unknown route", "path": self.path})
    do_HEAD = do_GET

    def _body(self):
        n = int(self.headers.get("Content-Length", "0") or "0")
        try: return json.loads(self.rfile.read(n) or b"{}")
        except Exception: return None

    def do_PUT(self):
        parts = self._parts()
        if parts and parts[0] == "config" and len(parts) == 2 and SAFE.match(parts[1]):
            obj = self._body()
            if obj is None: return self._json(400, {"error": "invalid json"})
            fp = os.path.join(CONFIGS, parts[1] + ".json"); tmp = fp + ".tmp"
            with open(tmp, "w") as f: json.dump(obj, f)
            os.replace(tmp, fp); return self._json(200, {"ok": True})
        return self._json(404, {"error": "unknown route"})

    def do_POST(self):
        parts = self._parts()
        if parts and parts[0] == "fetch":
            return self._json(200, proxy_fetch(self._body() or {}))
        if parts and parts[0] == "store" and len(parts) == 2 and parts[1] in ("install", "update", "remove"):
            obj = self._body() or {}
            wid = obj.get("id", "")
            if not SAFE.match(wid or ""): return self._json(400, {"error": "bad id"})
            try:
                if parts[1] == "remove": remove(wid)
                else: install(wid)
                return self._json(200, {"ok": True, "manifest": build_manifest()})
            except Exception as e:
                return self._json(500, {"error": str(e)})
        return self._json(404, {"error": "unknown route"})

def main():
    ensure_dirs(); seed(); build_dev_catalog(); start_all()
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), H)
    print("cw-hub :%d data=%s catalog=%s installed=%s" % (PORT, DATA_DIR, CATALOG_URL, installed_ids()), flush=True)
    try: httpd.serve_forever()
    except KeyboardInterrupt: _stop_all.set()

if __name__ == "__main__":
    main()
