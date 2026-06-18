(function () {
  CW.register("rss", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function feeds() { return (cfg.feeds || "").split("\n").map(function (l) { return l.trim(); }).filter(Boolean); }
    function parse(xml) {
      var doc = new DOMParser().parseFromString(xml, "text/xml"), out = [];
      [].slice.call(doc.querySelectorAll("item")).forEach(function (it) {
        var t = it.querySelector("title"), l = it.querySelector("link"), dt = it.querySelector("pubDate");
        out.push({ title: t ? t.textContent : "", link: l ? l.textContent : "", date: dt ? Date.parse(dt.textContent) : 0 });
      });
      [].slice.call(doc.querySelectorAll("entry")).forEach(function (it) {
        var t = it.querySelector("title"), l = it.querySelector("link"), dt = it.querySelector("updated, published");
        out.push({ title: t ? t.textContent : "", link: l ? (l.getAttribute("href") || l.textContent) : "", date: dt ? Date.parse(dt.textContent) : 0 });
      });
      return out;
    }
    function tick() {
      var fs = feeds();
      if (!fs.length) { root.innerHTML = '<div class="cw-hint">⚙ Add feed URLs, one per line</div>'; return Promise.resolve(); }
      return Promise.all(fs.map(function (u) { return ctx.text(u).then(parse).catch(function () { return []; }); })).then(function (lists) {
        var all = [].concat.apply([], lists).sort(function (a, b) { return b.date - a.date; }).slice(0, cfg.count || 10);
        root.innerHTML = '<div class="cw-rows"><div class="cw-links" style="width:100%">' +
          all.map(function (i) { return '<a href="' + CW.esc(i.link) + '" target="_blank" rel="noopener">' + CW.esc(i.title) + '</a>'; }).join("") + '</div></div>';
      });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 900) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("RSS Feed", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
