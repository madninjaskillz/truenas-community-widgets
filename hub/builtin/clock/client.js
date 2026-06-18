/* clock widget — producer-less; element-scoped (multi-instance safe), schema-driven config. */
(function () {
  function mount(el, ctx) {
    var schema = ctx.schema || {};
    var vals = CW.fields.merge(schema, null);
    CW.style("cwclk-css",
      ".cwclk{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--fg1,#e6edf3)}" +
      ".cwclk .t{font-size:clamp(20px,7vw,46px);font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:1px}" +
      ".cwclk .d{font-size:13px;color:var(--fg2,#9aa4af);margin-top:4px;text-align:center}");
    var root = CW.h("div", { "class": "cwclk" }, [CW.h("div", { "class": "t" }), CW.h("div", { "class": "d" })]);
    el.appendChild(root);
    var tEl = root.querySelector(".t"), dEl = root.querySelector(".d");   // scoped — no global ids
    function render() {
      var n = new Date(), tz = vals.timezone || undefined;
      var o = { hour: "2-digit", minute: "2-digit", hour12: false };
      if (vals.seconds) o.second = "2-digit";
      if (tz) o.timeZone = tz;
      tEl.textContent = n.toLocaleTimeString([], o);
      var od = { weekday: "long", month: "long", day: "numeric" };
      if (tz) od.timeZone = tz;
      dEl.textContent = n.toLocaleDateString([], od) + (tz ? " · " + tz : "");
    }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Clock settings", function (body) {
        CW.fields.render(body, schema, vals, function (v) { vals = v; ctx.saveConfig(v); render(); });
      });
    });
    ctx.getConfig().then(function (s) { vals = CW.fields.merge(schema, s); render(); });
    render();
    var iv = setInterval(render, 1000);
    return function () { clearInterval(iv); };
  }
  CW.register("clock", mount);
})();
