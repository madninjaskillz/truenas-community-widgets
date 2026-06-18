(function () {
  CW.register("arr", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function tick() {
      if (!cfg.url || !cfg.apikey) { root.innerHTML = '<div class="cw-hint">⚙ Set URL + API key</div>'; return Promise.resolve(); }
      var base = cfg.url.replace(/\/+$/, "");
      return ctx.json(base + "/api/v3/queue?pageSize=20", { headers: { "X-Api-Key": cfg.apikey } }).then(function (d) {
        var recs = d.records || [];
        root.innerHTML = '<div class="cw-hd">' + CW.esc(cfg.type || "arr") + ' · ' + (d.totalRecords != null ? d.totalRecords : recs.length) + ' queued</div>' +
          (recs.length ? '<div class="cw-rows">' + recs.slice(0, 12).map(function (r) {
            return '<div class="cw-row"><span class="k">' + CW.esc(r.title || r.sourceTitle || "item") + '</span><span class="v">' + CW.esc(r.status || "") + '</span></div>';
          }).join("") + '</div>' : '<div class="cw-sub">queue empty</div>');
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 60) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Sonarr / Radarr / Lidarr", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
