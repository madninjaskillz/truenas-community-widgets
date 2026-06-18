/* gpu-monitor widget client. Registers with the CW SDK; the loader calls mount(el, ctx). */
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
  var DEFAULTS = { graphs: { vram: 1, clock: 1, power: 1, temp: 1, fan: 1 }, gpuIndex: 0, fanKey: "fan1" };

  var CSS =
    "#?-inner{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;gap:3px;color:var(--fg1,#e6edf3);font:inherit;width:100%;padding-top:2px}" +
    "#?-inner .r{flex:1 1 0;min-height:0;display:flex;flex-direction:column}" +
    "#?-inner .lab{display:flex;justify-content:space-between;align-items:baseline;line-height:1.2;margin-bottom:1px}" +
    "#?-inner .lab .k{color:var(--fg2,#9aa4af);letter-spacing:.6px;text-transform:uppercase;font-size:10px}" +
    "#?-inner .lab .v{color:var(--fg1,#e6edf3);font-weight:600;font-size:13px}" +
    "#?-inner .lab .v small{color:var(--fg2,#9aa4af);font-weight:400;margin-left:4px;font-size:10px}" +
    "#?-inner .g{position:relative;flex:1 1 0;min-height:14px}" +
    "#?-inner .g svg{position:absolute;inset:0;width:100%;height:100%}" +
    "#?-inner .ax{position:absolute;right:2px;font-size:9px;line-height:1;color:var(--fg2,#9aa4af);background:var(--bg2,rgba(0,0,0,.25));padding:0 2px;border-radius:2px}" +
    "#?-inner .ax.mx{top:0} #?-inner .ax.mn{bottom:0}" +
    "#?-inner .xax{flex:0 0 auto;display:flex;justify-content:space-between;font-size:9px;color:var(--fg2,#9aa4af);margin-top:1px}" +
    ".cwg-gear{position:absolute;top:6px;right:6px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;color:var(--fg2,#9aa4af);opacity:.65;z-index:6}" +
    ".cwg-gear:hover{opacity:1;background:var(--alt-bg2,rgba(255,255,255,.08))}.cwg-gear svg{width:15px;height:15px;fill:currentColor}" +
    ".cwg-bd{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000;display:flex;align-items:center;justify-content:center}" +
    ".cwg-modal{background:var(--bg1,#1c2330);color:var(--fg1,#e6edf3);border:1px solid var(--lines,rgba(255,255,255,.12));border-radius:10px;min-width:280px;max-width:340px;font:13px/1.4 Roboto,Arial,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.55)}" +
    ".cwg-modal .h{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;border-bottom:1px solid var(--lines,rgba(255,255,255,.1));font-weight:600}" +
    ".cwg-modal .x{cursor:pointer;opacity:.6;font-size:16px}.cwg-modal .x:hover{opacity:1}" +
    ".cwg-modal .b{padding:10px 14px 14px}.cwg-modal .sec{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--fg2,#9aa4af);margin:12px 0 5px}" +
    ".cwg-modal label{display:flex;align-items:center;gap:8px;padding:3px 0;cursor:pointer}.cwg-modal label input{accent-color:var(--primary,#4aa8ff)}" +
    ".cwg-modal select{width:100%;background:var(--bg2,#11161e);color:var(--fg1,#e6edf3);border:1px solid var(--lines,rgba(255,255,255,.15));border-radius:6px;padding:6px 8px;font:inherit;box-sizing:border-box}";

  var GEAR = '<svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.61-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 0 0-.61.22L2.3 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.14.24.43.34.68.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.24.26.42.5.42h3.8a.5.5 0 0 0 .5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.25.12.54.02.68-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.06-1.58zM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z"/></svg>';

  function mergeCfg(saved) {
    var c = { graphs: {}, gpuIndex: DEFAULTS.gpuIndex, fanKey: DEFAULTS.fanKey };
    ORDER.forEach(function (g) { c.graphs[g] = DEFAULTS.graphs[g]; });
    if (saved && saved.graphs) ORDER.forEach(function (g) { if (g in saved.graphs) c.graphs[g] = saved.graphs[g] ? 1 : 0; });
    if (saved && saved.gpuIndex != null) c.gpuIndex = saved.gpuIndex;
    if (saved && saved.fanKey) c.fanKey = saved.fanKey;
    return c;
  }

  function mount(el, ctx) {
    var uid = "cwg-" + ctx.instanceId.slice(0, 8);
    CW.style("cwg-style-" + uid, CSS.replace(/\?/g, uid));
    var cfg = mergeCfg(null), lastDoc = null;
    var card = el.closest(".card") || el.parentElement;

    // gear (top-right of native card)
    if (card && !card.querySelector(".cwg-gear-" + uid)) {
      var gear = CW.h("div", { "class": "cwg-gear cwg-gear-" + uid, title: "GPU Monitor settings", html: GEAR,
        onclick: function (e) { e.stopPropagation(); openModal(); } });
      card.appendChild(gear);
    }

    function build() {
      el.innerHTML = "";
      var inner = CW.h("div", { id: uid + "-inner" });
      var enabled = ORDER.filter(function (g) { return cfg.graphs[g]; });
      enabled.forEach(function (g) {
        inner.appendChild(CW.h("div", { "class": "r", html:
          '<div class="lab"><span class="k">' + GDEF[g].label + '</span><span class="v" id="' + uid + '-' + g + '-v">—</span></div>' +
          '<div class="g"><svg id="' + uid + '-' + g + '-g" viewBox="0 0 240 40" preserveAspectRatio="none"></svg>' +
          '<span class="ax mx" id="' + uid + '-' + g + '-mx"></span><span class="ax mn" id="' + uid + '-' + g + '-mn"></span></div>' }));
      });
      if (!enabled.length) inner.innerHTML = '<div style="color:var(--fg2,#9aa4af);font-size:11px;margin:auto">No graphs — open ⚙</div>';
      else inner.appendChild(CW.h("div", { "class": "xax", html: '<span id="' + uid + '-xl"></span><span>now</span>' }));
      el.appendChild(inner);
    }
    function setHtml(id, v) { var e = document.getElementById(uid + "-" + id); if (e) e.innerHTML = v; }
    function setTxt(id, v) { var e = document.getElementById(uid + "-" + id); if (e) e.textContent = v; }
    function pickGpu(d) { var gs = d.gpus || []; for (var i = 0; i < gs.length; i++) if (gs[i].index === cfg.gpuIndex) return gs[i]; return gs[0] || null; }
    function pickFan(d) { var fs = d.fans || []; for (var i = 0; i < fs.length; i++) if (fs[i].key === cfg.fanKey) return fs[i]; return fs[0] || null; }
    function draw(g, arr, lo, hi, fmtAxis) {
      var svg = document.getElementById(uid + "-" + g + "-g"); if (svg) svg.innerHTML = CW.sparkline(arr || [], { lo: lo, hi: hi, color: GDEF[g].color });
      var mx = document.getElementById(uid + "-" + g + "-mx"), mn = document.getElementById(uid + "-" + g + "-mn");
      if (mx) mx.textContent = fmtAxis(hi); if (mn) mn.textContent = fmtAxis(lo);
    }
    function render(d) {
      lastDoc = d; var gpu = pickGpu(d) || {}, fan = pickFan(d);
      var gh = gpu.history || {}, gc = gpu.current || {}, vtot = gc.vram_total || 16384;
      if (cfg.graphs.vram) { setHtml("vram-v", gc.vram_used != null ? (gc.vram_used / 1024).toFixed(1) + " / " + (vtot / 1024).toFixed(1) + " GB" + (gc.vram_total ? ' <small>' + Math.round(100 * gc.vram_used / gc.vram_total) + '%</small>' : '') : "—"); draw("vram", gh.vram, 0, vtot, function (v) { return (v / 1024).toFixed(0) + "G"; }); }
      if (cfg.graphs.clock) { setHtml("clock-v", gc.clock != null ? gc.clock + " MHz" : "—"); draw("clock", gh.clock, SCALE.clock[0], SCALE.clock[1], function (v) { return Math.round(v) + ""; }); }
      if (cfg.graphs.power) { setHtml("power-v", gc.power != null ? gc.power + " W" : "—"); draw("power", gh.power, SCALE.power[0], SCALE.power[1], function (v) { return Math.round(v) + "W"; }); }
      if (cfg.graphs.temp) { setHtml("temp-v", gc.temp != null ? gc.temp + "°C" : "—"); draw("temp", gh.temp, SCALE.temp[0], SCALE.temp[1], function (v) { return Math.round(v) + "°"; }); }
      if (cfg.graphs.fan) { setHtml("fan-v", fan && fan.current != null ? fan.current + " RPM" : "—"); draw("fan", fan ? fan.history : [], SCALE.fan[0], SCALE.fan[1], function (v) { return Math.round(v) + ""; }); }
      var t = d.t || []; if (t.length > 1) setTxt("xl", "-" + Math.max(1, Math.round((t[t.length - 1] - t[0]) / 60)) + "m");
    }
    function openModal() {
      closeModal();
      var bd = CW.h("div", { "class": "cwg-bd cwg-bd-" + uid, onclick: function (e) { if (e.target === bd) closeModal(); } });
      var body = CW.h("div", { "class": "b" });
      body.appendChild(CW.h("div", { "class": "sec", text: "Graphs" }));
      ORDER.forEach(function (g) {
        var cb = CW.h("input", { type: "checkbox" }); cb.checked = !!cfg.graphs[g];
        cb.addEventListener("change", function () { cfg.graphs[g] = cb.checked ? 1 : 0; save(); build(); if (lastDoc) render(lastDoc); });
        body.appendChild(CW.h("label", {}, [cb, GDEF[g].label]));
      });
      body.appendChild(CW.h("div", { "class": "sec", text: "GPU" }));
      var gsel = CW.h("select");
      ((lastDoc && lastDoc.gpus) || []).forEach(function (gp) { var o = CW.h("option", { value: gp.index }, [gp.name + " (#" + gp.index + ")"]); if (gp.index === cfg.gpuIndex) o.selected = true; gsel.appendChild(o); });
      gsel.addEventListener("change", function () { cfg.gpuIndex = parseInt(gsel.value, 10) || 0; save(); if (lastDoc) render(lastDoc); });
      body.appendChild(gsel);
      body.appendChild(CW.h("div", { "class": "sec", text: "Fan source" }));
      var fsel = CW.h("select");
      ((lastDoc && lastDoc.fans) || []).forEach(function (fo) { var o = CW.h("option", { value: fo.key }, [fo.key + " — " + (fo.current != null ? fo.current + " RPM" : "—")]); if (fo.key === cfg.fanKey) o.selected = true; fsel.appendChild(o); });
      fsel.addEventListener("change", function () { cfg.fanKey = fsel.value; save(); if (lastDoc) render(lastDoc); });
      body.appendChild(fsel);
      var x = CW.h("span", { "class": "x", text: "✕", onclick: closeModal });
      var modal = CW.h("div", { "class": "cwg-modal" }, [CW.h("div", { "class": "h" }, [CW.h("span", { text: "GPU Monitor settings" }), x]), body]);
      bd.appendChild(modal); document.body.appendChild(bd);
    }
    function closeModal() { var b = document.querySelector(".cwg-bd-" + uid); if (b) b.remove(); }
    function save() { ctx.saveConfig(cfg); }

    build();
    ctx.getConfig().then(function (saved) { cfg = mergeCfg(saved); build(); if (lastDoc) render(lastDoc); });
    var stop = CW.poll(function () { return ctx.data("stats.json").then(render); }, 5000);

    return function cleanup() {
      stop(); closeModal();
      var g = card && card.querySelector(".cwg-gear-" + uid); if (g) g.remove();
    };
  }

  CW.register("gpu-monitor", mount);
})();
