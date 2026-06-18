(function () {
  CW.register("http-endpoint", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), hist = [], stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function tick() {
      if (!cfg.url) { root.innerHTML = '<div class="cw-hint">⚙ Set a URL to monitor</div>'; return Promise.resolve(); }
      var t = Date.now();
      return ctx.fetch(cfg.url).then(function (d) {
        var ms = Date.now() - t, up = !d.error && d.status < 400, st = d.error ? "ERR" : d.status;
        hist.push(up ? ms : null); if (hist.length > 120) hist.shift();
        root.innerHTML = '<div class="cw-hd">' + CW.esc(cfg.url) + '</div>' +
          '<div class="cw-big ' + (up ? "cw-ok" : "cw-down") + '">' + st + '</div>' +
          '<div class="cw-sub">' + (up ? ms + " ms" : CW.esc(d.error || "down")) + '</div>' +
          '<div style="flex:1 1 0;min-height:20px;position:relative"><svg style="position:absolute;inset:0;width:100%;height:100%" viewBox="0 0 240 40" preserveAspectRatio="none">' +
          CW.sparkline(hist, { color: up ? "#3ddc84" : "#ff6b6b" }) + '</svg></div>';
      });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 15) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("HTTP Endpoint", function (b) {
        CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); hist = []; kick(); }, { widgetId: ctx.widgetId });
      });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
