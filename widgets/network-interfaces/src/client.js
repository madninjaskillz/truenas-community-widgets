(function () {
  CW.register("network-interfaces", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function speedLabel(subtype) {
      var m = /^(\d+(?:\.\d+)?)\s*([GgMm])?base/.exec(subtype || "");
      if (!m) return "";
      var n = parseFloat(m[1]), mbps = /g/i.test(m[2] || "") ? n * 1000 : n;
      return mbps >= 1000 ? (mbps % 1000 ? (mbps / 1000).toFixed(1) : (mbps / 1000)) + " Gbps" : mbps + " Mbps";
    }
    function tick() {
      if (!cfg.url || !cfg.apikey) { root.innerHTML = '<div class="cw-hint">⚙ Set TrueNAS URL + API key</div>'; return Promise.resolve(); }
      var base = cfg.url.replace(/\/+$/, "");
      return ctx.json(base + "/api/v2.0/interface", { headers: { "Authorization": "Bearer " + cfg.apikey } }).then(function (list) {
        var rows = (list || []).map(function (i) {
          var st = i.state || {}, up = st.link_state === "LINK_STATE_UP";
          var speed = up ? speedLabel(st.active_media_subtype) : "";
          return '<div class="cw-row"><span class="k">' + CW.esc(i.name || i.id) + '</span><span class="v ' + (up ? "cw-ok" : "cw-down") +
            '">' + (up ? "● " + CW.esc(speed || "up") : "● down") + '</span></div>';
        });
        root.innerHTML = rows.length ? '<div class="cw-rows">' + rows.join("") + '</div>' : '<div class="cw-hint">No interfaces found</div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 30) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Network Interfaces", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
