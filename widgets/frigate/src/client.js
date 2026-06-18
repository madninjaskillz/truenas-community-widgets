(function () {
  CW.register("frigate", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function tick() {
      if (!cfg.url) { root.innerHTML = '<div class="cw-hint">⚙ Set Frigate URL</div>'; return Promise.resolve(); }
      var base = cfg.url.replace(/\/+$/, "");
      return ctx.json(base + "/api/stats").then(function (d) {
        var cams = d.cameras || {}, names = Object.keys(cams);
        root.innerHTML = '<div class="cw-hd">Frigate · ' + names.length + ' cameras</div>' +
          '<div class="cw-rows">' + names.slice(0, 12).map(function (n) {
            var c = cams[n] || {};
            return '<div class="cw-row"><span class="k">' + CW.esc(n) + '</span><span class="v">' + (c.detection_fps != null ? c.detection_fps + " fps" : "") + '</span></div>';
          }).join("") + '</div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 15) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Frigate", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
