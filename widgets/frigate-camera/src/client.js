(function () {
  CW.register("frigate-camera", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null, haveCams = false;
    CW.style("cwcam-css",
      ".cwcam{flex:1 1 0;min-height:0;display:grid;gap:4px;grid-auto-rows:1fr}" +
      ".cwcam figure{margin:0;position:relative;min-height:0;overflow:hidden;border-radius:6px;background:#000;display:flex;align-items:center;justify-content:center}" +
      ".cwcam img{width:100%;height:100%;object-fit:cover;display:block}" +
      ".cwcam figcaption{position:absolute;left:6px;bottom:4px;font-size:11px;color:#fff;background:rgba(0,0,0,.55);padding:1px 6px;border-radius:4px}");
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function cams() { return (cfg.cameras || "").split(/[\n,]/).map(function (s) { return s.trim(); }).filter(Boolean); }
    function build() {
      var list = cams(); haveCams = !!(cfg.url && list.length);
      if (!haveCams) { root.innerHTML = '<div class="cw-hint">⚙ Set the Frigate URL + camera name(s)</div>'; return; }
      var n = list.length, cols = n <= 1 ? 1 : (n <= 4 ? 2 : 3);
      root.innerHTML = '<div class="cwcam" style="grid-template-columns:repeat(' + cols + ',1fr)">' +
        list.map(function (c) { return '<figure><img alt="' + CW.esc(c) + '"><figcaption>' + CW.esc(c) + '</figcaption></figure>'; }).join("") + '</div>';
    }
    function refresh() {
      if (!haveCams) return;
      var list = cams(), b = cfg.url.replace(/\/+$/, ""), figs = root.querySelectorAll(".cwcam figure");
      list.forEach(function (c, i) {
        var img = figs[i] && figs[i].querySelector("img");
        if (img) img.src = ctx.imgUrl(b + "/api/" + encodeURIComponent(c) + "/latest.jpg?h=" + (cfg.height || 360)) + "&t=" + Date.now();
      });
    }
    function kick() { if (stop) stop(); build(); refresh(); stop = CW.poll(refresh, (cfg.interval || 2) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Frigate Camera", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
