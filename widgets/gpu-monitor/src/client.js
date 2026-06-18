/* gpu-monitor client — element-scoped (multi-instance), standardized schema config. */
(function () {
  var ORDER = ["vram", "clock", "power", "temp", "fan"];
  var GDEF = {
    vram:  { label: "VRAM",  color: "var(--primary,#4aa8ff)" },
    clock: { label: "Clock", color: "#56c8d8" },
    power: { label: "Power", color: "#ebcb8b" },
    temp:  { label: "Temp",  color: "#ff8c42" },
    fan:   { label: "Fan",   color: "#3ddc84" }
  };
  var SCALE = { clock: [0, 1530], power: [0, 300], temp: [0, 100], fan: [0, 2000] };
  var CSS =
    ".cwgpu{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:3px;color:var(--fg1,#e6edf3);width:100%;height:100%;padding-top:2px}" +
    ".cwgpu .r{flex:1 1 0;min-height:0;display:flex;flex-direction:column}" +
    ".cwgpu .lab{display:flex;justify-content:space-between;align-items:baseline;line-height:1.2;margin-bottom:1px}" +
    ".cwgpu .lab .k{color:var(--fg2,#9aa4af);letter-spacing:.6px;text-transform:uppercase;font-size:10px}" +
    ".cwgpu .lab .v{color:var(--fg1,#e6edf3);font-weight:600;font-size:13px}" +
    ".cwgpu .lab .v small{color:var(--fg2,#9aa4af);font-weight:400;margin-left:4px;font-size:10px}" +
    ".cwgpu .gph{position:relative;flex:1 1 0;min-height:14px}.cwgpu .gph svg{position:absolute;inset:0;width:100%;height:100%}" +
    ".cwgpu .ax{position:absolute;right:2px;font-size:9px;line-height:1;color:var(--fg2,#9aa4af);background:var(--bg2,rgba(0,0,0,.25));padding:0 2px;border-radius:2px}" +
    ".cwgpu .ax.mx{top:0}.cwgpu .ax.mn{bottom:0}" +
    ".cwgpu .xax{flex:0 0 auto;display:flex;justify-content:space-between;font-size:9px;color:var(--fg2,#9aa4af);margin-top:1px}";

  function norm(c) { c = c || {}; if (!Array.isArray(c.graphs)) c.graphs = ORDER.slice(); if (c.gpuIndex == null) c.gpuIndex = 0; if (!c.fanKey) c.fanKey = "fan1"; return c; }

  function mount(el, ctx) {
    var schema = ctx.schema || {};
    CW.style("cwgpu-css", CSS);
    var cfg = norm(CW.fields.merge(schema, null));
    var lastDoc = null, inner = null;
    function enabled() { return ORDER.filter(function (g) { return cfg.graphs.indexOf(g) >= 0; }); }
    function build() {
      el.innerHTML = "";
      var html = enabled().map(function (g) {
        return '<div class="r" data-g="' + g + '"><div class="lab"><span class="k">' + GDEF[g].label + '</span><span class="v">—</span></div>' +
          '<div class="gph"><svg viewBox="0 0 240 40" preserveAspectRatio="none"></svg><span class="ax mx"></span><span class="ax mn"></span></div></div>';
      }).join("") + '<div class="xax"><span class="xl"></span><span>now</span></div>';
      inner = CW.h("div", { "class": "cwgpu", html: enabled().length ? html : '<div style="color:var(--fg2,#9aa4af);font-size:11px;margin:auto">No graphs — open ⚙</div>' });
      el.appendChild(inner);
    }
    function pickGpu(d) { var gs = d.gpus || []; for (var i = 0; i < gs.length; i++) if (String(gs[i].index) === String(cfg.gpuIndex)) return gs[i]; return gs[0] || null; }
    function pickFan(d) { var fs = d.fans || []; for (var i = 0; i < fs.length; i++) if (fs[i].key === cfg.fanKey) return fs[i]; return fs[0] || null; }
    function axisFmt(g, v) { return g === "vram" ? (v / 1024).toFixed(0) + "G" : g === "power" ? Math.round(v) + "W" : g === "temp" ? Math.round(v) + "°" : Math.round(v) + ""; }
    function render(d) {
      lastDoc = d; if (!inner) return;
      var gpu = pickGpu(d) || {}, fan = pickFan(d), gh = gpu.history || {}, gc = gpu.current || {}, vtot = gc.vram_total || 16384;
      enabled().forEach(function (g) {
        var row = inner.querySelector('.r[data-g="' + g + '"]'); if (!row) return;
        var arr, hi, txt;
        if (g === "vram") { arr = gh.vram; hi = vtot; txt = gc.vram_used != null ? (gc.vram_used / 1024).toFixed(1) + " / " + (vtot / 1024).toFixed(1) + " GB" + (gc.vram_total ? ' <small>' + Math.round(100 * gc.vram_used / gc.vram_total) + '%</small>' : '') : "—"; }
        else if (g === "fan") { arr = fan ? fan.history : []; hi = SCALE.fan[1]; txt = fan && fan.current != null ? fan.current + " RPM" : "—"; }
        else { arr = gh[g]; hi = SCALE[g][1]; txt = gc[g] != null ? gc[g] + (g === "clock" ? " MHz" : g === "power" ? " W" : "°C") : "—"; }
        row.querySelector(".v").innerHTML = txt;
        row.querySelector("svg").innerHTML = CW.sparkline(arr || [], { lo: 0, hi: hi, color: GDEF[g].color });
        row.querySelector(".mx").textContent = axisFmt(g, hi);
        row.querySelector(".mn").textContent = axisFmt(g, 0);
      });
      var t = d.t || [], xl = inner.querySelector(".xl");
      if (xl && t.length > 1) xl.textContent = "-" + Math.max(1, Math.round((t[t.length - 1] - t[0]) / 60)) + "m";
    }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("GPU Monitor settings", function (body) {
        CW.fields.render(body, schema, cfg, function (v) { cfg = norm(v); ctx.saveConfig(cfg); build(); if (lastDoc) render(lastDoc); }, { widgetId: ctx.widgetId });
      });
    });
    ctx.getConfig().then(function (s) { cfg = norm(CW.fields.merge(schema, s)); build(); if (lastDoc) render(lastDoc); });
    build();
    var stop = CW.poll(function () { return ctx.data("stats.json").then(render); }, 5000);
    return function () { stop(); };
  }
  CW.register("gpu-monitor", mount);
})();
