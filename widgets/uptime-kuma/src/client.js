(function () {
  CW.register("uptime-kuma", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function tick() {
      if (!cfg.url || !cfg.slug) { root.innerHTML = '<div class="cw-hint">⚙ Set Uptime Kuma URL + status-page slug</div>'; return Promise.resolve(); }
      var base = cfg.url.replace(/\/+$/, "");
      return Promise.all([
        ctx.json(base + "/api/status-page/" + cfg.slug),
        ctx.json(base + "/api/status-page/heartbeat/" + cfg.slug)
      ]).then(function (r) {
        var names = {};
        (r[0].publicGroupList || []).forEach(function (g) { (g.monitorList || []).forEach(function (m) { names[m.id] = m.name; }); });
        var hl = r[1].heartbeatList || {};
        var rows = Object.keys(hl).map(function (id) {
          var arr = hl[id], last = arr && arr.length ? arr[arr.length - 1] : null;
          return { name: names[id] || ("#" + id), up: last && last.status === 1 };
        });
        if (!rows.length) { root.innerHTML = '<div class="cw-hint">No monitors on that status page</div>'; return; }
        root.innerHTML = '<div class="cw-rows">' + rows.map(function (r) {
          return '<div class="cw-row"><span class="k">' + CW.esc(r.name) + '</span><span class="v ' + (r.up ? "cw-ok" : "cw-down") + '">' + (r.up ? "● up" : "● down") + '</span></div>';
        }).join("") + '</div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 60) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Uptime Kuma", function (b) {
        CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId });
      });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
