(function () {
  CW.register("github", function (el, ctx) {
    var schema = ctx.schema || {}, cfg = CW.fields.merge(schema, null), stop = null;
    var root = CW.h("div", { "class": "cw-w" }); el.appendChild(root);
    function tick() {
      if (!cfg.repo) { root.innerHTML = '<div class="cw-hint">⚙ Set a repository (owner/name)</div>'; return Promise.resolve(); }
      var h = cfg.token ? { "Authorization": "token " + cfg.token } : {};
      return ctx.json("https://api.github.com/repos/" + cfg.repo, { headers: h }).then(function (d) {
        root.innerHTML = '<div class="cw-hd">' + CW.esc(cfg.repo) + '</div><div class="cw-rows">' +
          '<div class="cw-row"><span class="k">★ Stars</span><span class="v">' + (d.stargazers_count != null ? d.stargazers_count : "?") + '</span></div>' +
          '<div class="cw-row"><span class="k">Issues</span><span class="v">' + (d.open_issues_count != null ? d.open_issues_count : "?") + '</span></div>' +
          '<div class="cw-row"><span class="k">Forks</span><span class="v">' + (d.forks_count != null ? d.forks_count : "?") + '</span></div></div>';
      }).catch(function (e) { root.innerHTML = '<div class="cw-err">' + CW.esc("" + e) + '</div>'; });
    }
    function kick() { if (stop) stop(); stop = CW.poll(tick, 600000); }
    CW.attachGear(el.closest(".card"), function () {
      CW.openModal("GitHub Repo", function (b) { CW.fields.render(b, schema, cfg, function (v) { cfg = v; ctx.saveConfig(v); kick(); }, { widgetId: ctx.widgetId }); });
    });
    ctx.getConfig().then(function (s) { cfg = CW.fields.merge(schema, s); kick(); });
    kick();
    return function () { if (stop) stop(); };
  });
})();
