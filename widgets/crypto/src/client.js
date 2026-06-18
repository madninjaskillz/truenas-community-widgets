(function () {
  CW.register("crypto", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function fmt(n) { return n == null ? "?" : (n >= 1 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toPrecision(3)); }
    function tick() {
      var ids = (cfg.coins || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      if (!ids.length) { root.innerHTML = '<div class="cw-hint">⚙ Set coin ids (e.g. bitcoin,ethereum)</div>'; return Promise.resolve(); }
      var cur = (cfg.currency || "usd").toLowerCase();
      return ctx.json("https://api.coingecko.com/api/v3/simple/price?ids=" + encodeURIComponent(ids.join(",")) + "&vs_currencies=" + cur + "&include_24hr_change=true").then(function (d) {
        root.innerHTML = '<div class="cw-rows">' + ids.map(function (id) {
          var c = d[id]; if (!c) return '<div class="cw-row"><span class="k">' + CW.esc(id) + '</span><span class="v cw-down">?</span></div>';
          var ch = c[cur + "_24h_change"], cls = ch >= 0 ? "cw-ok" : "cw-down";
          return '<div class="cw-row"><span class="k">' + CW.esc(id) + '</span><span class="v">' + fmt(c[cur]) +
            ' <span class="' + cls + '">' + (ch >= 0 ? "+" : "") + (ch != null ? ch.toFixed(1) : "?") + '%</span></span></div>';
        }).join("") + '</div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 120) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Crypto Ticker", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
