(function () {
  CW.register("downloads", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function sab() {
      var base = cfg.url.replace(/\/+$/, "");
      return ctx.json(base + "/api?mode=queue&output=json&apikey=" + encodeURIComponent(cfg.apikey || "")).then(function (d) {
        var slots = (d.queue || {}).slots || [];
        return { count: slots.length, items: slots.map(function (s) { return { n: s.filename, p: Math.round(parseFloat(s.percentage || "0")) }; }) };
      });
    }
    function qbit() {
      var base = cfg.url.replace(/\/+$/, "");
      return ctx.fetch(base + "/api/v2/auth/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": base },
        body: "username=" + encodeURIComponent(cfg.username || "") + "&password=" + encodeURIComponent(cfg.password || "") }).then(function (d) {
        var sc = (d.headers && (d.headers["Set-Cookie"] || d.headers["set-cookie"])) || "";
        var m = /SID=([^;]+)/.exec(sc); if (!m) throw new Error("qBittorrent login failed");
        return ctx.json(base + "/api/v2/torrents/info?filter=downloading", { headers: { "Cookie": "SID=" + m[1], "Referer": base } });
      }).then(function (list) { return { count: list.length, items: list.map(function (t) { return { n: t.name, p: Math.round((t.progress || 0) * 100) }; }) }; });
    }
    function tick() {
      if (!cfg.url) { root.innerHTML = '<div class="cw-hint">⚙ Set URL + credentials</div>'; return Promise.resolve(); }
      var t = cfg.type || "qbittorrent";
      return (t === "sabnzbd" ? sab() : qbit()).then(function (r) {
        root.innerHTML = '<div class="cw-hd">' + CW.esc(t) + ' · ' + r.count + ' active</div>' +
          (r.items.length ? '<div class="cw-rows">' + r.items.slice(0, 10).map(function (i) { return '<div class="cw-row"><span class="k">' + CW.esc(i.n) + '</span><span class="v">' + i.p + '%</span></div>'; }).join("") + '</div>' : '<div class="cw-sub">no active downloads</div>');
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 10) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Downloads", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
