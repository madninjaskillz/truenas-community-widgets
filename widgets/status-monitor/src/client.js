(function () {
  CW.register("status-monitor", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function parse() {
      return (cfg.services || "").split("\n").map(function (l) {
        l = l.trim(); if (!l) return null; var i = l.indexOf("|");
        return i < 0 ? { name: l, url: l } : { name: l.slice(0, i).trim(), url: l.slice(i + 1).trim() };
      }).filter(Boolean);
    }
    function check(s) {
      var t = Date.now();
      return ctx.fetch(s.url, { method: "GET" }).then(function (d) {
        return { name: s.name, up: !d.error && d.status && d.status < 500, ms: Date.now() - t };
      }).catch(function () { return { name: s.name, up: false, ms: Date.now() - t }; });
    }
    function render() {
      var list = parse();
      if (!list.length) { root.innerHTML = '<div class="cw-hint">⚙ Add services, one per line:<br><b>Label|https://url</b></div>'; return; }
      Promise.all(list.map(check)).then(function (rs) {
        root.innerHTML = '<div class="cw-rows">' + rs.map(function (r) {
          return '<div class="cw-row"><span class="k">' + CW.esc(r.name) + '</span><span class="v ' +
            (r.up ? "cw-ok" : "cw-down") + '">' + (r.up ? "● " + r.ms + "ms" : "● down") + '</span></div>';
        }).join("") + '</div>';
      });
    }
    function kick() { if (stop) stop(); render(); stop = CW.poll(render, (cfg.interval || 30) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Status Monitor", function (b) {
        CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId });
      });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
