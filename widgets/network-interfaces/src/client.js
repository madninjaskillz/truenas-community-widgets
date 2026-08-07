(function () {
  CW.register("network-interfaces", function (el, ctx) {
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function speedLabel(mbps) {
      if (!mbps) return "";
      return mbps >= 1000 ? (mbps % 1000 ? (mbps / 1000).toFixed(1) : (mbps / 1000)) + " Gbps" : mbps + " Mbps";
    }
    function render(d) {
      var list = (d && d.interfaces) || [];
      root.innerHTML = list.length ? '<div class="cw-rows">' + list.map(function (i) {
        var up = i.state === "up";
        return '<div class="cw-row"><span class="k">' + CW.esc(i.name) + '</span><span class="v ' + (up ? "cw-ok" : "cw-down") +
          '">' + (up ? "● " + CW.esc(speedLabel(i.speed_mbps) || "up") : "● " + CW.esc(i.state)) + '</span></div>';
      }).join("") + '</div>' : '<div class="cw-hint">No interfaces found</div>';
    }
    var stop = CW.poll(function () {
      return ctx.data("stats.json").then(render).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }, 10000);
    return function () { stop(); };
  });
})();
