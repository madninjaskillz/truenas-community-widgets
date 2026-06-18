(function () {
  CW.register("ssl-cert", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function parse() {
      return (cfg.hosts || "").split("\n").map(function (l) {
        l = l.trim(); if (!l) return null; var p = l.split(":");
        return { host: p[0], port: p[1] ? parseInt(p[1], 10) : 443 };
      }).filter(Boolean);
    }
    function render() {
      var list = parse();
      if (!list.length) { root.innerHTML = '<div class="cw-hint">⚙ Add hosts, one per line:<br><b>example.com</b> or <b>host:8443</b></div>'; return; }
      Promise.all(list.map(function (h) { return ctx.cert(h.host, h.port).then(function (d) { return { host: h.host, d: d }; }); })).then(function (rs) {
        root.innerHTML = '<div class="cw-rows">' + rs.map(function (r) {
          var d = r.d;
          if (d.error || d.daysLeft == null) return '<div class="cw-row"><span class="k">' + CW.esc(r.host) + '</span><span class="v cw-down">err</span></div>';
          var cls = d.daysLeft > 30 ? "cw-ok" : d.daysLeft > 7 ? "cw-warn" : "cw-down";
          return '<div class="cw-row"><span class="k">' + CW.esc(r.host) + '</span><span class="v ' + cls + '">' + d.daysLeft + 'd</span></div>';
        }).join("") + '</div>';
      });
    }
    function kick() { if (stop) stop(); render(); stop = CW.poll(render, 3600000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("SSL Certificates", function (b) {
        CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId });
      });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
