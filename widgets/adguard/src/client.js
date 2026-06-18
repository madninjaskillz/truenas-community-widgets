(function () {
  CW.register("adguard", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function tick() {
      if (!cfg.url || !cfg.username) { root.innerHTML = '<div class="cw-hint">⚙ Set AdGuard URL + login</div>'; return Promise.resolve(); }
      var h = { "Authorization": "Basic " + btoa(cfg.username + ":" + (cfg.password || "")) };
      return ctx.json(cfg.url.replace(/\/+$/, "") + "/control/stats", { headers: h }).then(function (d) {
        var q = d.num_dns_queries || 0, b = d.num_blocked_filtering || 0, pct = q ? (100 * b / q).toFixed(1) : "0";
        root.innerHTML = '<div class="cw-hd">AdGuard Home</div><div class="cw-big">' + pct + '%</div><div class="cw-sub">blocked</div>' +
          '<div class="cw-rows" style="margin-top:6px"><div class="cw-row"><span class="k">Queries</span><span class="v">' + q + '</span></div>' +
          '<div class="cw-row"><span class="k">Blocked</span><span class="v">' + b + '</span></div></div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 60) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("AdGuard Home", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
