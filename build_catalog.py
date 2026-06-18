#!/usr/bin/env python3
"""Build per-widget zips and the root catalog.json. Run in CI on every push, or
locally: `python3 build_catalog.py`. For each widgets/<id>/ it zips metadata.json
plus the flattened contents of src/ into widgets/<id>/<id>-<version>.zip, then writes
catalog.json (with sha256 of each zip). The Hub points CW_CATALOG_URL at the raw
catalog.json; zip paths are repo-relative so they resolve against the same raw base."""
import json, os, zipfile, hashlib

ROOT = os.path.dirname(os.path.abspath(__file__))
WID = os.path.join(ROOT, "widgets")

TEXT_EXT = {".js", ".py", ".json", ".css", ".html", ".md", ".svg", ".txt", ".yaml", ".yml"}

def add(z, arcname, path):
    # Deterministic entry: fixed timestamp + mode, and LF-normalized text, so Windows
    # and Linux/CI produce byte-identical zips (and matching sha256).
    data = open(path, "rb").read()
    if os.path.splitext(arcname)[1].lower() in TEXT_EXT:
        data = data.replace(b"\r\n", b"\n")
    zi = zipfile.ZipInfo(arcname, date_time=(1980, 1, 1, 0, 0, 0))
    zi.compress_type = zipfile.ZIP_DEFLATED
    zi.external_attr = 0o644 << 16
    z.writestr(zi, data)

def build():
    widgets = []
    for wid in sorted(os.listdir(WID)):
        wdir = os.path.join(WID, wid)
        mpath = os.path.join(wdir, "metadata.json")
        if not os.path.isfile(mpath):
            continue
        m = json.load(open(mpath))
        ver = m.get("version", "0")
        zrel = "widgets/%s/%s-%s.zip" % (wid, wid, ver)
        zpath = os.path.join(ROOT, zrel)
        entries = [("metadata.json", mpath)]
        src = os.path.join(wdir, "src")
        for base, _, files in os.walk(src):
            for fn in files:
                fp = os.path.join(base, fn)
                entries.append((os.path.relpath(fp, src).replace("\\", "/"), fp))
        entries.sort()
        with zipfile.ZipFile(zpath, "w") as z:
            for arc, fp in entries:
                add(z, arc, fp)
        sha = hashlib.sha256(open(zpath, "rb").read()).hexdigest()
        widgets.append({"id": m.get("id", wid), "name": m.get("name", wid), "version": ver,
                        "description": m.get("description", ""), "author": m.get("author", ""),
                        "supportedSizes": m.get("supportedSizes", ["quarter", "half", "full"]),
                        "permissions": m.get("permissions", []), "zip": zrel, "sha256": sha})
        print("built", zrel, sha[:12])
    with open(os.path.join(ROOT, "catalog.json"), "w") as f:
        json.dump({"version": 1, "widgets": widgets}, f, indent=2)
    print("catalog.json: %d widgets" % len(widgets))

if __name__ == "__main__":
    build()
