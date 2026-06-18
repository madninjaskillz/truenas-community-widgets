(function () {
  CW.register("portainer", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function endpointId(base) {
      if (cfg.endpoint) return Promise.resolve(cfg.endpoint);
      return ctx.json(base + "/api/endpoints", { headers: { "X-API-Key": cfg.apikey } }).then(function (eps) { return (eps[0] || {}).Id || 1; });
    }
    function tick() {
      if (!cfg.url || !cfg.apikey) { root.innerHTML = '<div class="cw-hint">⚙ Set Portainer URL + API key</div>'; return Promise.resolve(); }
      var base = cfg.url.replace(/\/+$/, "");
      return endpointId(base).then(function (id) {
        return ctx.json(base + "/api/endpoints/" + id + "/docker/containers/json?all=1", { headers: { "X-API-Key": cfg.apikey } });
      }).then(function (list) {
        var run = list.filter(function (c) { return c.State === "running"; }).length;
        root.innerHTML = '<div class="cw-hd">Portainer</div><div class="cw-big">' + run + ' / ' + list.length + '</div><div class="cw-sub">containers running</div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 30) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Portainer", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
