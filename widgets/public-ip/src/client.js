(function () {
  CW.register("public-ip", function (el, ctx) {
    var stop = null, root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function tick() {
      return ctx.json("http://ip-api.com/json/?fields=query,isp,city,regionName,country").then(function (d) {
        root.innerHTML = '<div class="cw-hd">Public IP</div><div class="cw-big">' + CW.esc(d.query || "?") + '</div>' +
          '<div class="cw-sub">' + CW.esc([d.isp, d.city, d.country].filter(Boolean).join(" · ")) + '</div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    stop = CW.poll(tick, 300000);
    return function () { if (stop) stop(); };
  });
})();
