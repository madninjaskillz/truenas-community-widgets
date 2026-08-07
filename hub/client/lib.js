/* CW client SDK — loaded once into the TrueNAS WebUI. Widgets use window.CW. */
(function () {
  if (window.CW && window.CW.__v) return;
  var CW = (window.CW = window.CW || {});
  CW.__v = 1;
  CW._reg = {};        // widgetId -> mount(el, ctx) -> optional cleanup
  CW._pending = {};    // widgetId -> [{el, ctx}]

  // Widget client.js calls CW.register("<id>", mountFn). Fulfils pending mounts.
  CW.register = function (id, mount) {
    CW._reg[id] = mount;
    (CW._pending[id] || []).forEach(function (job) {
      try { job.cleanup = mount(job.el, job.ctx); } catch (e) { console.error("[CW] mount", id, e); }
    });
    CW._pending[id] = [];
  };
  // Loader calls CW.mount(id, el, ctx) once the client script is (being) loaded.
  CW.mount = function (id, el, ctx) {
    var job = { el: el, ctx: ctx };
    if (CW._reg[id]) { try { job.cleanup = CW._reg[id](el, ctx); } catch (e) { console.error("[CW] mount", id, e); } }
    else { (CW._pending[id] = CW._pending[id] || []).push(job); }
    return job;
  };

  // ---- tiny DOM helper ----
  CW.h = function (tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  };
  CW.esc = function (s) { return (s == null ? "" : "" + s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  CW.style = function (id, css) {
    if (document.getElementById(id)) return;
    var s = document.createElement("style"); s.id = id; s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  };

  // ---- fixed-scale sparkline (returns SVG innerHTML); non-scaling stroke ----
  CW.sparkline = function (arr, opts) {
    opts = opts || {};
    var w = 240, h = 40, pad = 3, lo = opts.lo != null ? opts.lo : 0, hi = opts.hi;
    var color = opts.color || "var(--primary,#4aa8ff)";
    if (hi == null) { // autoscale
      var v = arr.filter(function (x) { return x != null; });
      lo = v.length ? Math.min.apply(null, v) : 0;
      hi = v.length ? Math.max.apply(null, v) : 1;
    }
    if (!(hi > lo)) hi = lo + 1;
    var grid = "";
    [0, 0.5, 1].forEach(function (g) {
      var yy = (pad + g * (h - 2 * pad)).toFixed(1);
      grid += '<line x1="0" y1="' + yy + '" x2="' + w + '" y2="' + yy + '" stroke="var(--fg2,#9aa4af)" stroke-width="0.5" vector-effect="non-scaling-stroke" opacity="0.16"/>';
    });
    var n = arr.length, d = "", any = false;
    for (var i = 0; i < n; i++) {
      if (arr[i] == null) continue;
      var val = arr[i]; if (val < lo) val = lo; if (val > hi) val = hi;
      var x = n === 1 ? 0 : (i / (n - 1)) * w;
      var y = pad + (1 - (val - lo) / (hi - lo)) * (h - 2 * pad);
      d += (d === "" ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " ";
      any = true;
    }
    if (!any) return grid;
    return grid
      + '<path d="' + d + 'L' + w + ' ' + h + ' L0 ' + h + ' Z" fill="' + color + '" opacity="0.15"/>'
      + '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>';
  };

  // ---- polling helper: returns stop() ----
  CW.poll = function (fn, ms) {
    var stopped = false;
    function tick() { if (stopped) return; try { var r = fn(); if (r && r.then) { r.finally(later); return; } } catch (e) {} later(); }
    function later() { if (!stopped) t = setTimeout(tick, ms); }
    var t = setTimeout(tick, 0);
    return function () { stopped = true; clearTimeout(t); };
  };

  // ---- ctx factory (loader uses this to build the per-instance context) ----
  CW.makeCtx = function (widgetId, instanceId, opts) {
    opts = opts || {};
    var base = "/cw";
    return {
      widgetId: widgetId,
      instanceId: instanceId,
      size: opts.size || "full",
      schema: opts.schema || {},
      data: function (file) { return fetch(base + "/data/" + widgetId + "/" + file, { cache: "no-store" }).then(function (r) { return r.json(); }); },
      dataUrl: function (file) { return base + "/data/" + widgetId + "/" + file; },
      getConfig: function () { return fetch(base + "/config/" + instanceId, { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return {}; }); },
      saveConfig: function (obj) { return fetch(base + "/config/" + instanceId, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj) }); },
      // server-side fetch (avoids CORS, reaches LAN services with per-instance config)
      fetch: function (url, opts) {
        opts = opts || {};
        return fetch(base + "/fetch", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url, method: opts.method, headers: opts.headers, body: opts.body }) })
          .then(function (r) { return r.json(); });   // -> {status, body} or {error}
      },
      json: function (url, opts) { return this.fetch(url, opts).then(function (d) { if (d.error) throw new Error(d.error); if (d.status >= 400) throw new Error("HTTP " + d.status); return JSON.parse(d.body); }); },
      text: function (url, opts) { return this.fetch(url, opts).then(function (d) { if (d.error) throw new Error(d.error); return d.body; }); },
      cert: function (host, port) { return fetch(base + "/cert?host=" + encodeURIComponent(host) + "&port=" + (port || 443)).then(function (r) { return r.json(); }); },
      // same-origin image proxy URL (for camera snapshots; avoids mixed-content/CORS)
      imgUrl: function (url, auth) { return base + "/img?url=" + encodeURIComponent(url) + (auth ? "&auth=" + encodeURIComponent(auth) : ""); },
      // same-origin streaming proxy URL (e.g. MJPEG live stream in an <img>)
      streamUrl: function (url, auth) { return base + "/stream?url=" + encodeURIComponent(url) + (auth ? "&auth=" + encodeURIComponent(auth) : ""); }
    };
  };

  // ---- standardized schema-driven config (used by gear modal AND the editor) ----
  var GEAR = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.3 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.26.42.5.42h3.8a.5.5 0 0 0 .5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.25.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.06-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';
  CW.style("cw-sdk-css",
    ".cw-gear{position:absolute;top:6px;right:6px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;color:var(--fg2,#9aa4af);opacity:.65;z-index:6}" +
    ".cw-gear:hover{opacity:1;background:var(--alt-bg2,rgba(255,255,255,.08))}.cw-gear svg{width:15px;height:15px;fill:currentColor}" +
    ".cw-modal-bd{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000;display:flex;align-items:center;justify-content:center}" +
    ".cw-modal{background:var(--bg1,#1c2330);color:var(--fg1,#e6edf3);border:1px solid var(--lines,rgba(255,255,255,.12));border-radius:10px;min-width:300px;max-width:360px;font:13px/1.4 Roboto,Arial,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.55)}" +
    ".cw-modal-h{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--lines,rgba(255,255,255,.1));font-weight:600}" +
    ".cw-modal-x{cursor:pointer;opacity:.6;font-size:16px}.cw-modal-x:hover{opacity:1}.cw-modal-b{padding:12px 14px}" +
    ".cw-f{margin:0 0 10px}.cw-f-lab{font-size:12px;color:var(--fg2,#9aa4af);margin-bottom:4px}" +
    ".cw-f-ctrl,.cw-fields select,.cw-fields input[type=text],.cw-fields input[type=number]{width:100%;box-sizing:border-box;background:var(--bg2,#11161e);color:var(--fg1,#e6edf3);border:1px solid var(--lines,rgba(255,255,255,.15));border-radius:6px;padding:7px 9px;font:inherit}" +
    ".cw-f-bool{display:flex;align-items:center;gap:8px;cursor:pointer}.cw-f-bool input{accent-color:var(--primary,#4aa8ff)}" +
    ".cw-fields textarea{resize:vertical;min-height:64px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px}" +
    // shared widget layout utilities (keep individual widgets tiny)
    ".cw-w{height:100%;display:flex;flex-direction:column;color:var(--fg1,#e6edf3);font:inherit;min-height:0;overflow:hidden}" +
    ".cw-w .cw-hd{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--fg2,#9aa4af);margin-bottom:4px;flex:0 0 auto}" +
    ".cw-big{font-size:clamp(18px,6vw,34px);font-weight:600;line-height:1.1;font-variant-numeric:tabular-nums}" +
    ".cw-sub{font-size:12px;color:var(--fg2,#9aa4af)}" +
    ".cw-hint{margin:auto;text-align:center;color:var(--fg2,#9aa4af);font-size:12px;padding:8px}" +
    ".cw-err{margin:auto;text-align:center;color:#ff8c42;font-size:11px;padding:8px;word-break:break-word}" +
    ".cw-rows{flex:1 1 0;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:5px}" +
    ".cw-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px}" +
    ".cw-row .k{color:var(--fg2,#9aa4af);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".cw-row .v{font-weight:600;white-space:nowrap}" +
    ".cw-ok{color:#3ddc84}.cw-down{color:#ff6b6b}.cw-warn{color:#ebcb8b}" +
    ".cw-chips{display:flex;flex-wrap:wrap;gap:6px}.cw-chip{background:var(--alt-bg2,rgba(255,255,255,.08));border-radius:6px;padding:3px 8px;font-size:12px}" +
    ".cw-links{display:grid;gap:6px}.cw-links a{display:block;background:var(--alt-bg2,rgba(255,255,255,.08));border-radius:6px;padding:8px 10px;color:var(--fg1,#e6edf3);text-decoration:none;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cw-links a:hover{background:var(--primary,#4aa8ff);color:#fff}");

  var KNOWN = { bool: 1, select: 1, timezone: 1, number: 1, string: 1, multi: 1, textarea: 1 };
  CW.fields = {
    defaults: function (schema) { var v = {}; for (var k in (schema || {})) v[k] = schema[k].default; return v; },
    merge: function (schema, stored) { var v = CW.fields.defaults(schema); if (stored) for (var k in (schema || {})) if (k in stored) v[k] = stored[k]; return v; },
    tzList: function () { try { if (Intl.supportedValuesOf) return Intl.supportedValuesOf("timeZone"); } catch (e) {} return ["UTC", "Europe/London", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/Paris", "Asia/Tokyo", "Australia/Sydney"]; },
    // render schema into container, bound to values; calls onChange(values) on edits.
    // opts.widgetId enables `optionsFrom` selects (options pulled live from a producer data file).
    render: function (container, schema, values, onChange, opts) {
      opts = opts || {};
      container.className = (container.className || "") + " cw-fields";
      container.innerHTML = "";
      function emit() { onChange(Object.assign({}, values)); }
      Object.keys(schema || {}).forEach(function (k) {
        var f = schema[k]; if (!KNOWN[f.type]) return;
        if (f.type === "bool") {
          var cb = CW.h("input", { type: "checkbox" }); cb.checked = !!values[k];
          cb.addEventListener("change", function () { values[k] = cb.checked; emit(); });
          container.appendChild(CW.h("div", { "class": "cw-f" }, [CW.h("label", { "class": "cw-f-bool" }, [cb, " " + (f.label || k)])])); return;
        }
        if (f.type === "multi") {
          var cur = Array.isArray(values[k]) ? values[k].slice() : [];
          var box = CW.h("div", { "class": "cw-f" }, [CW.h("div", { "class": "cw-f-lab", text: f.label || k })]);
          (f.options || []).forEach(function (o) {
            var val = (o && o.value != null) ? o.value : o, lab = (o && o.label) ? o.label : val;
            var cb = CW.h("input", { type: "checkbox" }); cb.checked = cur.indexOf(val) >= 0;
            cb.addEventListener("change", function () {
              if (cb.checked) { if (cur.indexOf(val) < 0) cur.push(val); } else cur = cur.filter(function (x) { return x !== val; });
              values[k] = cur.slice(); emit();
            });
            box.appendChild(CW.h("label", { "class": "cw-f-bool" }, [cb, " " + lab]));
          });
          container.appendChild(box); return;
        }
        if (f.type === "textarea") {
          var ta = CW.h("textarea", { "class": "cw-f-ctrl", rows: f.rows || 4 });
          ta.value = values[k] != null ? values[k] : "";
          ta.addEventListener("input", function () { values[k] = ta.value; emit(); });
          container.appendChild(CW.h("div", { "class": "cw-f" }, [CW.h("div", { "class": "cw-f-lab", text: f.label || k }), ta]));
          return;
        }
        var ctrl;
        if (f.type === "select" || f.type === "timezone") {
          ctrl = CW.h("select", { "class": "cw-f-ctrl" });
          ctrl.addEventListener("change", function () { values[k] = ctrl.value; emit(); });
          if (f.optionsFrom && opts.widgetId) {                 // dynamic options from a producer file
            ctrl.add(new Option("…", ""));
            fetch("/cw/data/" + opts.widgetId + "/" + f.optionsFrom.file, { cache: "no-store" })
              .then(function (r) { return r.json(); }).then(function (d) {
                ctrl.innerHTML = "";
                (d[f.optionsFrom.path] || []).forEach(function (it) {
                  var val = it[f.optionsFrom.value], lab = it[f.optionsFrom.label] != null ? it[f.optionsFrom.label] : val;
                  var op = new Option(lab, val); if (String(values[k]) === String(val)) op.selected = true; ctrl.add(op);
                });
              }).catch(function () {});
          } else {
            if (f.type === "timezone") ctrl.add(new Option("Local", ""));
            (f.type === "timezone" ? CW.fields.tzList() : (f.options || [])).forEach(function (o) {
              var val = (o && o.value != null) ? o.value : o, lab = (o && o.label) ? o.label : val;
              var op = new Option(lab, val); if (values[k] === val) op.selected = true; ctrl.add(op);
            });
          }
        } else if (f.type === "number") {
          ctrl = CW.h("input", { type: "number", "class": "cw-f-ctrl" }); ctrl.value = values[k] != null ? values[k] : "";
          ctrl.addEventListener("change", function () { values[k] = parseFloat(ctrl.value); emit(); });
        } else {
          ctrl = CW.h("input", { type: "text", "class": "cw-f-ctrl" }); ctrl.value = values[k] != null ? values[k] : "";
          ctrl.addEventListener("input", function () { values[k] = ctrl.value; emit(); });
        }
        container.appendChild(CW.h("div", { "class": "cw-f" }, [CW.h("div", { "class": "cw-f-lab", text: f.label || k }), ctrl]));
      });
    }
  };
  CW.attachGear = function (card, onClick) {
    if (!card || card.querySelector(".cw-gear")) return;
    card.appendChild(CW.h("div", { "class": "cw-gear", title: "Settings", html: GEAR, onclick: function (e) { e.stopPropagation(); onClick(); } }));
  };
  CW.closeModal = function () { var b = document.querySelector(".cw-modal-bd"); if (b) b.remove(); };
  CW.openModal = function (title, build) {
    CW.closeModal();
    var bd = CW.h("div", { "class": "cw-modal-bd", onclick: function (e) { if (e.target === bd) CW.closeModal(); } });
    var body = CW.h("div", { "class": "cw-modal-b" });
    var x = CW.h("span", { "class": "cw-modal-x", text: "✕", onclick: CW.closeModal });
    bd.appendChild(CW.h("div", { "class": "cw-modal" }, [CW.h("div", { "class": "cw-modal-h" }, [CW.h("span", { text: title }), x]), body]));
    build(body); document.body.appendChild(bd); return bd;
  };

  // ---- Widget Store rendering — shared by the standalone store.html page and the
  // embedded dashboard panel (loader.js), so there's one implementation, not two. Uses
  // TrueNAS's real design tokens (--bg1/--fg1/--primary/--lines/--font-family-*) so it
  // matches whatever page it's rendered into; store.html sets fallback values itself for
  // standalone use, where those variables aren't otherwise defined.
  CW.style("cw-store-css",
    ".cw-store *{box-sizing:border-box}" +
    ".cw-store{font:14px/1.5 var(--font-family-body,\"IBM Plex Sans\",Roboto,Arial,sans-serif);color:var(--fg1,#e6edf3)}" +
    ".cw-store .card{display:flex;align-items:center;gap:14px;background:var(--bg2,#1c2330);border:1px solid var(--lines,rgba(255,255,255,.08));border-radius:10px;padding:14px 16px;margin:10px 0}" +
    ".cw-store .card .meta{flex:1;min-width:0}.cw-store .card .name{font-weight:600}.cw-store .card .ver{color:var(--fg2,#9aa4af);font-size:12px;margin-left:6px}" +
    ".cw-store .card .desc{color:var(--fg2,#9aa4af);font-size:12px;margin-top:2px}" +
    ".cw-store .tag{display:inline-block;font-size:10px;color:var(--fg2,#9aa4af);border:1px solid var(--lines,rgba(255,255,255,.15));border-radius:4px;padding:0 5px;margin-left:6px}" +
    ".cw-store button{font:inherit;border:0;border-radius:7px;padding:7px 14px;cursor:pointer;color:#fff}" +
    ".cw-store .install{background:var(--primary,#2563eb)}.cw-store .update{background:#b45309}" +
    ".cw-store .remove{background:transparent;color:#ff6b6b;border:1px solid rgba(255,107,107,.4)}" +
    ".cw-store button:disabled{opacity:.5;cursor:default}" +
    ".cw-store .note{color:var(--fg2,#9aa4af);font-size:12px;margin-top:18px}.cw-store .err{color:#ff8c42}" +
    ".cw-store .hub-card{margin:0 0 18px}" +
    ".cw-store .hub-status{color:var(--fg2,#9aa4af);font-size:12px;margin-top:2px}" +
    ".cw-store .hub-btn{background:var(--primary,#2563eb)}.cw-store .hub-reset{background:transparent;color:var(--fg2,#9aa4af);border:1px solid var(--lines,rgba(255,255,255,.15))}");

  CW.renderStore = function (container) {
    container.className = (container.className || "") + " cw-store";
    container.innerHTML =
      '<div class="card hub-card">' +
        '<div class="meta"><div class="name">Hub frontend</div>' +
        '<div class="hub-status" id="cw-hub-status">loader.js / lib.js / store.html — click to check for updates.</div></div>' +
        '<div style="display:flex;gap:8px">' +
          '<button class="hub-btn" id="cw-hub-update-btn">Check for Hub Update</button>' +
          '<button class="hub-reset" id="cw-hub-reset-btn">Reset to bundled</button>' +
        '</div>' +
      '</div>' +
      '<div id="cw-store-list">Loading…</div>';
    var $ = function (sel) { return container.querySelector(sel); };
    function api(action, id) {
      return fetch("/cw/store/" + action, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: id }) }).then(function (r) { return r.json(); });
    }
    $("#cw-hub-update-btn").onclick = function () {
      var b = $("#cw-hub-update-btn"), s = $("#cw-hub-status");
      b.disabled = true; b.textContent = "Checking…";
      fetch("/cw/hubupdate", { method: "POST" }).then(function (r) { return r.json(); }).then(function (r) {
        b.disabled = false; b.textContent = "Check for Hub Update";
        if (r.error) { s.className = "hub-status err"; s.textContent = "Error: " + r.error; return; }
        var errs = Object.keys(r.errors || {}), parts = [];
        if (r.changed && r.changed.length) parts.push("Updated: " + r.changed.join(", ") + " — reload the page to use them.");
        else if (!errs.length) parts.push("Already up to date.");
        if (errs.length) parts.push("Failed to fetch: " + errs.join(", ") + ".");
        s.className = "hub-status" + (errs.length ? " err" : ""); s.textContent = parts.join(" ");
      }).catch(function (e) { b.disabled = false; b.textContent = "Check for Hub Update"; $("#cw-hub-status").textContent = "Error: " + e; });
    };
    $("#cw-hub-reset-btn").onclick = function () {
      var s = $("#cw-hub-status");
      fetch("/cw/hubreset", { method: "POST" }).then(function (r) { return r.json(); }).then(function (r) {
        s.textContent = (r.removed && r.removed.length) ? ("Reverted to bundled: " + r.removed.join(", ") + " — reload the page.") : "Already on the bundled version.";
      }).catch(function (e) { s.textContent = "Error: " + e; });
    };
    function render(cat) {
      var list = $("#cw-store-list");
      if (cat.error) { list.innerHTML = '<p class="err">Catalog error: ' + CW.esc(cat.error) + "</p>"; }
      var ws = cat.widgets || [];
      if (!ws.length) { list.innerHTML = '<p class="note">No widgets in the catalog.</p>'; return; }
      list.innerHTML = "";
      ws.forEach(function (w) {
        var card = CW.h("div", { "class": "card" });
        var perms = (w.permissions || []).map(function (p) { return '<span class="tag">' + CW.esc(p) + "</span>"; }).join("");
        card.innerHTML = '<div class="meta"><div><span class="name">' + CW.esc(w.name) + '</span><span class="ver">v' + CW.esc(w.version) + "</span>" +
          (w.installed ? '<span class="tag">installed' + (w.installedVersion && w.installedVersion !== w.version ? " v" + CW.esc(w.installedVersion) : "") + "</span>" : "") + perms + "</div>" +
          '<div class="desc">' + CW.esc(w.description) + "</div></div>";
        var btns = CW.h("div");
        function mk(label, cls, action) {
          var b = CW.h("button", { "class": cls, text: label });
          b.onclick = function () { b.disabled = true; b.textContent = "…"; api(action, w.id).then(function (r) { if (r.error) { alert(r.error); b.disabled = false; } load(); }); };
          return b;
        }
        if (!w.installed) btns.appendChild(mk("Install", "install", "install"));
        else { if (w.updatable) btns.appendChild(mk("Update", "update", "update")); btns.appendChild(mk("Remove", "remove", "remove")); }
        card.appendChild(btns); list.appendChild(card);
      });
    }
    function load() {
      fetch("/cw/catalog", { cache: "no-store" }).then(function (r) { return r.json(); }).then(render)
        .catch(function (e) { $("#cw-store-list").innerHTML = '<p class="err">' + e + "</p>"; });
    }
    load();
  };
})();
