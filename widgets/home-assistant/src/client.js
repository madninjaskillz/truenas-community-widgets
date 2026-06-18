(function () {
  CW.register("home-assistant", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function entities() { return (cfg.entities || "").split("\n").map(function (s) { return s.trim(); }).filter(Boolean); }
    function tick() {
      var ents = entities();
      if (!cfg.url || !cfg.token || !ents.length) { root.innerHTML = '<div class="cw-hint">⚙ Set HA URL, token + entity IDs</div>'; return Promise.resolve(); }
      var b = cfg.url.replace(/\/+$/, ""), h = { "Authorization": "Bearer " + cfg.token };
      return Promise.all(ents.map(function (e) {
        return ctx.json(b + "/api/states/" + encodeURIComponent(e), { headers: h }).then(function (d) {
          var a = d.attributes || {};
          return { name: a.friendly_name || e, state: d.state, unit: a.unit_of_measurement || "" };
        }).catch(function () { return { name: e, state: "?", unit: "" }; });
      })).then(function (rs) {
        root.innerHTML = '<div class="cw-rows">' + rs.map(function (r) {
          return '<div class="cw-row"><span class="k">' + CW.esc(r.name) + '</span><span class="v">' + CW.esc(r.state) + (r.unit ? " " + CW.esc(r.unit) : "") + '</span></div>';
        }).join("") + '</div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 15) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Home Assistant", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
