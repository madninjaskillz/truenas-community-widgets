(function () {
  CW.register("proxmox", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function tick() {
      if (!cfg.url || !cfg.token) { root.innerHTML = '<div class="cw-hint">⚙ Set Proxmox URL + API token</div>'; return Promise.resolve(); }
      var base = cfg.url.replace(/\/+$/, "");
      return ctx.json(base + "/api2/json/cluster/resources?type=vm", { headers: { "Authorization": "PVEAPIToken=" + cfg.token } }).then(function (d) {
        var vms = d.data || [], run = vms.filter(function (v) { return v.status === "running"; }).length;
        root.innerHTML = '<div class="cw-hd">Proxmox · VMs/LXC</div><div class="cw-big">' + run + ' / ' + vms.length + '</div><div class="cw-sub">running</div>' +
          '<div class="cw-rows" style="margin-top:4px">' + vms.slice(0, 10).map(function (v) {
            return '<div class="cw-row"><span class="k">' + CW.esc(v.name || v.vmid) + '</span><span class="v ' + (v.status === "running" ? "cw-ok" : "cw-down") + '">' + CW.esc(v.status) + '</span></div>';
          }).join("") + '</div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, (cfg.interval || 30) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Proxmox", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
