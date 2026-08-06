(function () {
  CW.register("network-interfaces", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function speedLabel(subtype) {
      var m = /^(\d+(?:\.\d+)?)\s*([GgMm])?base/.exec(subtype || "");
      if (!m) return "";
      var n = parseFloat(m[1]), mbps = /g/i.test(m[2] || "") ? n * 1000 : n;
      return mbps >= 1000 ? (mbps % 1000 ? (mbps / 1000).toFixed(1) : (mbps / 1000)) + " Gbps" : mbps + " Mbps";
    }
    function tick() {
      var url = (cfg.url || "").trim(), key = (cfg.apikey || "").trim();
      if (!url || !key) {
        var missing = []; if (!url) missing.push("URL"); if (!key) missing.push("API key");
        root.innerHTML = '<div class="cw-hint">⚙ Set TrueNAS ' + missing.join(" + ") +
          '<br><span style="opacity:.7">URL e.g. https://192.168.1.50 &middot; key from Settings &rarr; API Keys</span></div>';
        return Promise.resolve();
      }
      if (!/^https?:\/\//i.test(url)) {
        root.innerHTML = '<div class="cw-err">URL must start with http:// or https:// (e.g. https://192.168.1.50)</div>';
        return Promise.resolve();
      }
      var base = url.replace(/\/+$/, "");
      return ctx.fetch(base + "/api/v2.0/interface", { headers: { "Authorization": "Bearer " + key } }).then(function (d) {
        if (d.error) throw new Error("Can't reach " + base + " — " + d.error);
        if (d.status === 401 || d.status === 403) throw new Error("TrueNAS rejected the API key (HTTP " + d.status + ") — check it's valid and hasn't expired");
        if (d.status === 404) throw new Error("HTTP 404 — check the URL is your TrueNAS base URL (e.g. https://192.168.1.50), not a /ui or /api path");
        if (d.status >= 400) throw new Error("TrueNAS returned HTTP " + d.status);
        var list;
        try { list = JSON.parse(d.body); } catch (e) { throw new Error("Unexpected (non-JSON) response — check the URL"); }
        var rows = (list || []).map(function (i) {
          var st = i.state || {}, up = st.link_state === "LINK_STATE_UP";
          var speed = up ? speedLabel(st.active_media_subtype) : "";
          return '<div class="cw-row"><span class="k">' + CW.esc(i.name || i.id) + '</span><span class="v ' + (up ? "cw-ok" : "cw-down") +
            '">' + (up ? "● " + CW.esc(speed || "up") : "● down") + '</span></div>';
        });
        root.innerHTML = rows.length ? '<div class="cw-rows">' + rows.join("") + '</div>' : '<div class="cw-hint">No interfaces found</div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc(e.message || ("" + e)) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 30) * 1000); }
    var saveTimer = null;
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Network Interfaces", function (b) {
        CW.fields.render(b, schema, cfg, function (v) {
          // debounced: saving on every keystroke sends overlapping requests that can land
          // out of order and leave the server with a stale, mid-typing partial value
          cfg = v; kick();
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(function () { ctx.saveConfig(cfg); }, 600);
        }, { widgetId: ctx.widgetId });
      });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
