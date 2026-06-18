(function () {
  CW.register("localai", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function tick() {
      if (!cfg.url) { root.innerHTML = '<div class="cw-hint">⚙ Set the server URL</div>'; return Promise.resolve(); }
      return ctx.json(cfg.url.replace(/\/+$/, "") + "/v1/models").then(function (d) {
        var ids = (d.data || []).map(function (m) { return m.id; });
        root.innerHTML = '<div class="cw-hd">LocalAI · ' + ids.length + ' models</div>' +
          (ids.length ? '<div class="cw-chips">' + ids.map(function (i) { return '<span class="cw-chip">' + CW.esc(i) + '</span>'; }).join("") + '</div>'
                      : '<div class="cw-sub">no models loaded</div>');
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 30) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("LocalAI", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
