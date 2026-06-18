# Contributing a widget

1. Fork and create `widgets/<your-id>/` with `metadata.json`, `README.md`, and `src/`
   (see the authoring guide in the main `README.md` and the schema in
   `schema/metadata.schema.json`).
2. Test locally: `python3 build_catalog.py` builds your zip and updates `catalog.json`.
3. Commit your `src/`, the built zip, and the updated `catalog.json`, then open a PR.
   CI **validates** (metadata schema + that each catalog sha256 matches the committed
   zip) — it does not rebuild, so run `build_catalog.py` before committing.

**Versioning:** treat a published `version` as immutable — bump it whenever a widget's
content changes, so the zip path changes and CDN caches never serve a stale pair.

## Review bar (trust model)
Because a widget's client JS runs inside the TrueNAS admin UI and its producer runs on
the host's GPU/sensors, every PR is manually reviewed. Keep producers least-privilege,
declare `permissions`, avoid network calls unless essential, and never touch the
TrueNAS API/session from client code beyond rendering your widget.
