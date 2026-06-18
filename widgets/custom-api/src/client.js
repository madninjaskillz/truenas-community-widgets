(function () {
  CW.register("custom-api", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function parseHeaders() {
      var h = {}; (cfg.headers || "").split("\n").forEach(function (l) { var i = l.indexOf(":"); if (i > 0) h[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }); return h;
    }
    function get(obj, path) {
      try { return path.split(".").reduce(function (o, k) { var m = /^([^\[]+)\[(\d+)\]$/.exec(k); return m ? o[m[1]][+m[2]] : o[k]; }, obj); }
      catch (e) { return undefined; }
    }
    function tick() {
      if (!cfg.url) { root.innerHTML = '<div class="cw-hint">⚙ Set a JSON URL and field mappings</div>'; return Promise.resolve(); }
      return ctx.json(cfg.url, { headers: parseHeaders() }).then(function (d) {
        var maps = (cfg.fields || "").split("\n").map(function (l) { var i = l.indexOf(":"); return i < 0 ? null : { label: l.slice(0, i).trim(), path: l.slice(i + 1).trim() }; }).filter(Boolean);
        if (!maps.length) { root.innerHTML = '<div class="cw-rows"><div class="cw-sub" style="word-break:break-all">' + CW.esc(JSON.stringify(d).slice(0, 500)) + '</div></div>'; return; }
        root.innerHTML = '<div class="cw-rows">' + maps.map(function (m) {
          var v = get(d, m.path);
          return '<div class="cw-row"><span class="k">' + CW.esc(m.label) + '</span><span class="v">' + CW.esc(v == null ? "–" : (typeof v === "object" ? JSON.stringify(v) : v)) + '</span></div>';
        }).join("") + '</div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 60) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Custom API", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
