/* clock widget — producer-less; demonstrates a pure-client CW widget. */
(function () {
  function mount(el, ctx) {
    var cfg = { seconds: true };
    CW.style("cwclk-css",
      "#cwclk{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--fg1,#e6edf3)}" +
      "#cwclk .t{font-size:clamp(20px,7vw,46px);font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:1px}" +
      "#cwclk .d{font-size:13px;color:var(--fg2,#9aa4af);margin-top:4px}");
    el.appendChild(CW.h("div", { id: "cwclk" }, [CW.h("div", { "class": "t", id: "cwclk-t" }), CW.h("div", { "class": "d", id: "cwclk-d" })]));
    function p(x) { return (x < 10 ? "0" : "") + x; }
    function tick() {
      var t = document.getElementById("cwclk-t"), d = document.getElementById("cwclk-d");
      if (!t) return;
      var n = new Date();
      t.textContent = p(n.getHours()) + ":" + p(n.getMinutes()) + (cfg.seconds ? ":" + p(n.getSeconds()) : "");
      d.textContent = n.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    }
    ctx.getConfig().then(function (s) { if (s && typeof s.seconds === "boolean") cfg.seconds = s.seconds; tick(); });
    tick();
    var iv = setInterval(tick, 1000);
    return function () { clearInterval(iv); };
  }
  CW.register("clock", mount);
})();
