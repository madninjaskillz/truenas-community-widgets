(function () {
  var WMO = { 0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
    51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain",
    67: "Freezing rain", 71: "Snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains", 80: "Showers", 81: "Showers",
    82: "Violent showers", 85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm" };
  CW.register("weather", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null, geo = null, geoKey = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function getGeo() {
      if (geo && geoKey === cfg.city) return Promise.resolve(geo);
      return ctx.json("https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(cfg.city)).then(function (d) {
        var r = (d.results || [])[0]; if (!r) throw new Error("city not found"); geo = r; geoKey = cfg.city; return r;
      });
    }
    function tick() {
      if (!cfg.city) { root.innerHTML = '<div class="cw-hint">⚙ Set a city</div>'; return Promise.resolve(); }
      var unit = cfg.units === "imperial" ? "fahrenheit" : "celsius", deg = cfg.units === "imperial" ? "°F" : "°C";
      return getGeo().then(function (g) {
        return ctx.json("https://api.open-meteo.com/v1/forecast?latitude=" + g.latitude + "&longitude=" + g.longitude +
          "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto&temperature_unit=" + unit).then(function (d) {
          var cur = d.current || {}, dy = d.daily || {};
          root.innerHTML = '<div class="cw-hd">' + CW.esc(g.name + (g.country_code ? ", " + g.country_code : "")) + '</div>' +
            '<div class="cw-big">' + Math.round(cur.temperature_2m) + deg + '</div>' +
            '<div class="cw-sub">' + CW.esc(WMO[cur.weather_code] || "") + '</div>' +
            '<div class="cw-rows" style="margin-top:6px">' + (dy.time || []).map(function (t, i) {
              return '<div class="cw-row"><span class="k">' + new Date(t).toLocaleDateString([], { weekday: "short" }) +
                '</span><span class="v">' + Math.round(dy.temperature_2m_min[i]) + " / " + Math.round(dy.temperature_2m_max[i]) + deg + '</span></div>';
            }).join("") + '</div>';
        });
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); geo = null; stop = CW.poll(tick, (cfg.interval || 900) * 1000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("Weather", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
