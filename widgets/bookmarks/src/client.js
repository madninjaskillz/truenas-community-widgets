(function () {
  CW.register("bookmarks", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null);
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function render() {
      var links = (cfg.links || "").split("\n").map(function (l) {
        l = l.trim(); if (!l) return null; var i = l.indexOf("|");
        return i < 0 ? { n: l, u: l } : { n: l.slice(0, i).trim(), u: l.slice(i + 1).trim() };
      }).filter(Boolean);
      if (!links.length) { root.innerHTML = '<div class="cw-hint">⚙ Add links, one per line:<br><b>Label|https://url</b></div>'; return; }
      var cols = cfg.columns || 1;
      root.innerHTML = '<div class="cw-rows"><div class="cw-links" style="grid-template-columns:repeat(' + cols + ',1fr);width:100%">' +
        links.map(function (l) { return '<a href="' + CW.esc(l.u) + '" target="_blank" rel="noopener">' + CW.esc(l.n) + '</a>'; }).join("") + '</div></div>';
    }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Bookmarks", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); render(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); render(); });
    render();
    return function () {};
  });
})();
