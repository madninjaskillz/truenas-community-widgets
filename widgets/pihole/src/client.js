(function () {
  CW.register("pihole", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function tick() {
      if (!cfg.url || !cfg.token) { root.innerHTML = '<div class="cw-hint">⚙ Set Pi-hole URL + API token</div>'; return Promise.resolve(); }
      var u = cfg.url.replace(/\/+$/, "") + "/admin/api.php?summary&auth=" + encodeURIComponent(cfg.token);
      return ctx.json(u).then(function (d) {
        root.innerHTML = '<div class="cw-hd">Pi-hole</div><div class="cw-big">' + (d.ads_percentage_today != null ? d.ads_percentage_today : "?") + '%</div>' +
          '<div class="cw-sub">blocked today</div><div class="cw-rows" style="margin-top:6px">' +
          '<div class="cw-row"><span class="k">Queries</span><span class="v">' + (d.dns_queries_today != null ? d.dns_queries_today : "?") + '</span></div>' +
          '<div class="cw-row"><span class="k">Blocked</span><span class="v">' + (d.ads_blocked_today != null ? d.ads_blocked_today : "?") + '</span></div></div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 60) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Pi-hole", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
