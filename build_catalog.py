#!/usr/bin/env python3
"""Build per-widget zips and the root catalog.json. Run in CI on every push, or
locally: `python3 build_catalog.py`. For each widgets/<id>/ it zips metadata.json
plus the flattened contents of src/ into widgets/<id>/<id>-<version>.zip, then writes
catalog.json (with sha256 of each zip). The Hub points CW_CATALOG_URL at the raw
catalog.json; zip paths are repo-relative so they resolve against the same raw base."""
import json, os, zipfile, hashlib

ROOT = os.path.dirname(os.path.abspath(__file__))
WID = os.path.join(ROOT, "widgets")

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
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(mpath, "metadata.json")
            src = os.path.join(wdir, "src")
            for base, _, files in os.walk(src):
                for fn in files:
                    fp = os.path.join(base, fn)
                    z.write(fp, os.path.relpath(fp, src))
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
