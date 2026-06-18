(function () {
  CW.register("image", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function render() {
      if (!cfg.url) { root.innerHTML = '<div class="cw-hint">⚙ Set an image URL</div>'; return; }
      var src = ctx.imgUrl(cfg.url) + (cfg.interval > 0 ? "&t=" + Date.now() : "");
      var img = root.querySelector("img");
      if (img) { img.src = src; return; }
      root.innerHTML = '<img style="width:100%;height:100%;object-fit:' + (cfg.fit || "contain") + '" src="' + src + '">';
    }
    function kick() { if (stop) stop(); render(); if (cfg.interval > 0) stop = CW.poll(render, cfg.interval * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Image", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); root.innerHTML = ""; kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); root.innerHTML = ""; kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
