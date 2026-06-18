(function () {
  CW.register("media-server", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function load() {
      var base = cfg.url.replace(/\/+$/, ""), t = cfg.type || "plex";
      if (t === "plex") {
        return ctx.json(base + "/status/sessions", { headers: { "X-Plex-Token": cfg.token, "Accept": "application/json" } }).then(function (d) {
          var mc = d.MediaContainer || {}, md = mc.Metadata || [];
          return { count: mc.size != null ? mc.size : md.length, items: md.map(function (m) { return (m.grandparentTitle ? m.grandparentTitle + " – " : "") + (m.title || ""); }) };
        });
      }
      return ctx.json(base + "/Sessions?api_key=" + encodeURIComponent(cfg.token)).then(function (arr) {
        var p = (arr || []).filter(function (s) { return s.NowPlayingItem; });
        return { count: p.length, items: p.map(function (s) { var n = s.NowPlayingItem; return (n.SeriesName ? n.SeriesName + " – " : "") + (n.Name || ""); }) };
      });
    }
    function tick() {
      if (!cfg.url || !cfg.token) { root.innerHTML = '<div class="cw-hint">⚙ Set URL + token</div>'; return Promise.resolve(); }
      return load().then(function (r) {
        root.innerHTML = '<div class="cw-hd">' + CW.esc(cfg.type || "media") + ' · now playing</div><div class="cw-big">' + r.count + '</div>' +
          (r.items.length ? '<div class="cw-rows" style="margin-top:4px">' + r.items.slice(0, 8).map(function (t) { return '<div class="cw-row"><span class="k">' + CW.esc(t) + '</span></div>'; }).join("") + '</div>' : '<div class="cw-sub">nothing streaming</div>');
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 30) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Media Server", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
