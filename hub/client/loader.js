/* CW loader — injected into the TrueNAS WebUI by the host nginx sub_filter.
   MVP: dashboard render path. Finds Arbitrary-Text widgets tagged #CW:{id}#{iid}
   and mounts the installed widget's client into the native card. (Picker added later.) */
(function () {
  if (window.__cwLoader) return;
  window.__cwLoader = true;
  var TAG = /#CW:([A-Za-z0-9._-]+)#([A-Za-z0-9-]+)/;
  var manifest = null, scriptLoaded = {};

  function ready(cb) {
    if (window.CW && window.CW.__v) return cb();
    var s = document.createElement("script");
    s.src = "/cw/lib.js"; s.onload = cb;
    (document.head || document.documentElement).appendChild(s);
  }
  function getManifest() {
    if (manifest) return Promise.resolve(manifest);
    return fetch("/cw/manifest.json", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (m) { manifest = m; return m; });
  }
  function widgetById(id) {
    return ((manifest && manifest.widgets) || []).filter(function (w) { return w.id === id; })[0];
  }
  function loadClient(w) {
    if (scriptLoaded[w.id]) return;
    scriptLoaded[w.id] = true;
    var s = document.createElement("script");
    s.src = w.client; s.onerror = function () { scriptLoaded[w.id] = false; };
    (document.head || document.documentElement).appendChild(s);
  }

  function mountInto(host, id, iid) {
    var content = host.querySelector(".card-content") || host.querySelector("mat-card-content");
    if (!content) return;
    var ft = content.querySelector("[fittext]"); if (ft) ft.style.display = "none";
    var sub = content.querySelector(".sub-text"); if (sub) sub.style.display = "none";
    host.classList.add("cw-host");
    if (content.querySelector(".cw-mount")) return;   // already mounted
    var mountEl = CW.h("div", { "class": "cw-mount", style: "height:100%;display:flex;flex-direction:column;min-height:0" });
    content.appendChild(mountEl);
    var w = widgetById(id);
    if (!w) {
      mountEl.innerHTML = '<div style="color:var(--fg2,#9aa4af);font-size:11px;margin:auto;text-align:center">Widget &ldquo;' + id + '&rdquo; not installed</div>';
      return;
    }
    loadClient(w);
    CW.mount(id, mountEl, CW.makeCtx(id, iid, { schema: w.config, size: "full" }));
  }

  // ---- Add-Widget picker: turn the Arbitrary-Text "Widget Text" field into a widget chooser ----
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // crypto.randomUUID() needs a secure context (HTTPS); getRandomValues() doesn't, so
    // this still gets proper entropy over plain-HTTP TrueNAS installs instead of a weak
    // Date.now()+Math.random() id that risks colliding with (and inheriting the stored
    // config of) an unrelated widget instance.
    var a = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
    a[6] = (a[6] & 0x0f) | 0x40; a[8] = (a[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(a, function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function setNative(input, val) {
    if (!input) return;
    var proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, "value").set;   // bypass Angular's patched value setter
    setter.call(input, val);
    ["input", "change", "blur"].forEach(function (ev) { input.dispatchEvent(new Event(ev, { bubbles: true })); });
  }
  var pendingWidget = null;   // set when a widget is chosen in the Type dropdown

  function setOptionLabel(opt, text) {   // MDC mat-option: .mdc-list-item__primary-text
    var t = opt.querySelector(".mdc-list-item__primary-text") || opt.querySelector("span") || opt;
    t.textContent = text;
  }
  // When the widget-Type mat-select panel opens (it contains an "Arbitrary Text"
  // option => Custom category), inject one option per installed widget. Picking one
  // selects the real Arbitrary Text type and stashes the widget id for the settings step.
  // Configure the (single, persistent) Arbitrary-Text settings form to represent a CW
  // widget (widId) or plain text (null). Idempotent — drives state directly rather than
  // relying on Angular re-rendering, since all CW types map to the same arbitrary-text type.
  function reconfigure(form, widId) {
    var inputs = form.querySelectorAll("ix-input"); if (inputs.length < 2) return;
    var titleIx = inputs[0], textIx = inputs[1];
    var titleInput = titleIx.querySelector("input,textarea");
    var textInput = textIx.querySelector("input,textarea");
    var ro = form.querySelector(".cw-ro");
    if (widId) {
      getManifest().then(function (m) {
        var w = (m.widgets || []).filter(function (x) { return x.id === widId; })[0];
        var cur = (textInput && textInput.value) || "";
        var mm = cur.match(/^#CW:([A-Za-z0-9._-]+)#/);
        if (!mm || mm[1] !== widId) setNative(textInput, "#CW:" + widId + "#" + uuid());   // mint a new instance id
        if (w && titleInput) setNative(titleInput, w.name);
        textIx.style.display = "none";
        var name = w ? w.name : widId;
        if (ro) { var nm = ro.querySelector(".cw-ro-name"); if (nm) nm.textContent = name; }
        else textIx.parentNode.insertBefore(
          CW.h("div", { "class": "cw-ro" }, [CW.h("div", { "class": "cw-pick-lab", text: "Widget" }), CW.h("div", { "class": "cw-ro-name", text: name })]), textIx);
        // inline per-instance config in the editor (same schema-driven UI as the gear modal)
        var guid = ((textInput.value || "").match(/#CW:[^#]+#(.+)$/) || [])[1];
        var cfgBox = form.querySelector(".cw-cfg");
        if (!cfgBox) { cfgBox = CW.h("div", { "class": "cw-cfg", style: "margin:0 0 12px" }); textIx.parentNode.insertBefore(cfgBox, textIx); }
        if (guid && w && w.config && Object.keys(w.config).length) {
          fetch("/cw/config/" + guid, { cache: "no-store" }).then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (stored) {
            CW.fields.render(cfgBox, w.config, CW.fields.merge(w.config, stored), function (v) {
              fetch("/cw/config/" + guid, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
            }, { widgetId: w.id });
          });
        } else { cfgBox.innerHTML = ""; }
      });
    } else {                              // plain Arbitrary Text: clear the CW tag, restore native field
      setNative(textInput, "");
      textIx.style.display = "";
      if (ro) ro.remove();
      var cb = form.querySelector(".cw-cfg"); if (cb) cb.remove();
    }
    form.__cwApplied = widId || null;
  }
  function afterPick(widId, tries) {     // settings form may render slightly after the type change
    var f = document.querySelector("ix-widget-arbitrary-text-settings");
    if (f && f.querySelectorAll("ix-input").length >= 2) { reconfigure(f, widId); pendingWidget = null; return; }
    if (tries > 0) setTimeout(function () { afterPick(widId, tries - 1); }, 60);
    else pendingWidget = null;
  }
  function maybeInjectTypes(panel) {
    if (panel.__cw) return;
    var at = null;
    panel.querySelectorAll("mat-option, .mat-mdc-option").forEach(function (o) {
      if (/arbitrary\s*text/i.test(o.textContent || "")) at = o;
    });
    if (!at) return;
    panel.__cw = true;
    var programmatic = false;
    at.addEventListener("click", function () {                  // user picking the real Arbitrary Text
      if (programmatic) { programmatic = false; return; }       // ignore our own at.click()
      pendingWidget = null; afterPick(null, 12);                // -> revert to plain text
    }, true);
    getManifest().then(function (m) {
      (m.widgets || []).forEach(function (w) {
        var clone = at.cloneNode(true);
        clone.removeAttribute("id");
        clone.classList.remove("mdc-list-item--selected", "mat-mdc-option-active", "mdc-list-item--activated");
        clone.setAttribute("aria-selected", "false");
        clone.setAttribute("data-cw-widget", w.id);
        setOptionLabel(clone, w.name);
        var chk = clone.querySelector(".mat-pseudo-checkbox-checked"); if (chk) chk.classList.remove("mat-pseudo-checkbox-checked");
        clone.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          pendingWidget = w.id; programmatic = true; at.click();   // force type=arbitrary-text + close panel
          afterPick(w.id, 12);                                     // then reconfigure the form to this widget
        }, true);
        at.parentNode.insertBefore(clone, at.nextSibling);
      });
    });
  }
  function checkPanels() {
    document.querySelectorAll(".mat-mdc-select-panel, [role='listbox']").forEach(maybeInjectTypes);
  }
  // The "Custom (N widget)" count is Angular's compiled value; we inject N extra type
  // options, so bump the Custom count (option label + the select trigger) by N.
  function fixCounts(n) {
    if (!n) return;
    document.querySelectorAll(".mdc-list-item__primary-text, .mat-mdc-select-value-text, .mat-mdc-select-min-line").forEach(function (el) {
      var base = el.__cwBase != null ? el.__cwBase : el.textContent;
      if (!/^\s*Custom\s*\(\d+\s*widgets?\)\s*$/.test(base)) return;
      el.__cwBase = base;
      var want = base.replace(/\((\d+)\s*widgets?\)/, function (_, d) {
        var v = parseInt(d, 10) + n; return "(" + v + " widget" + (v === 1 ? "" : "s") + ")";
      });
      if (el.textContent !== want) el.textContent = want;
    });
  }

  // Bootstrap a freshly-rendered settings form (editing an existing CW widget, or a
  // form created by a type change). Live switching is handled by reconfigure() via clicks.
  function augmentSettings(form) {
    if (form.__cwInit) return;
    var inputs = form.querySelectorAll("ix-input");
    if (inputs.length < 2) return;
    form.__cwInit = true;
    var textInput = inputs[1].querySelector("input,textarea");
    var mm = ((textInput && textInput.value) || "").match(/^#CW:([A-Za-z0-9._-]+)#/);
    var widId = pendingWidget || (mm && mm[1]) || null;
    pendingWidget = null;
    if (widId) reconfigure(form, widId);
  }

  // ---- Store overlay: full-screen, same tab, instead of a separate browser tab ----
  var storeOverlay = null, storeFrame = null;
  function openStoreOverlay() {
    if (!storeOverlay) {
      storeFrame = CW.h("iframe", { "class": "cw-store-frame", src: "/cw/store", title: "Widget Store" });
      var closeBtn = CW.h("button", { "class": "cw-store-close", title: "Close", "aria-label": "Close", html: "&times;" });
      closeBtn.addEventListener("click", closeStoreOverlay);
      storeOverlay = CW.h("div", { "class": "cw-store-overlay" }, [closeBtn, storeFrame]);
      document.body.appendChild(storeOverlay);
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && storeOverlay.classList.contains("open")) closeStoreOverlay();
      });
    } else {
      storeFrame.src = "/cw/store";   // refresh (e.g. reflect a widget just installed elsewhere)
    }
    storeOverlay.classList.add("open");
  }
  function closeStoreOverlay() { if (storeOverlay) storeOverlay.classList.remove("open"); }

  // A real left-sidebar entry, cloned from the "Dashboard" nav item so it inherits the
  // exact same layout/hover/collapsed-sidenav behavior instead of us reimplementing it.
  function mountSidebarNavItem() {
    if (document.getElementById("cw-nav-item")) return;
    var list = document.querySelector("ix-navigation mat-nav-list");
    var firstWrap = list && list.children[0];
    if (!firstWrap || firstWrap.tagName !== "DIV") return;
    var wrap = firstWrap.cloneNode(true);
    wrap.id = "cw-nav-item";
    var item = wrap.querySelector("mat-list-item");
    if (item) { item.removeAttribute("id"); item.classList.remove("highlighted"); }
    var a = wrap.querySelector("a");
    if (!a) return;
    a.removeAttribute("href"); a.removeAttribute("routerlinkactive"); a.removeAttribute("name");
    a.setAttribute("data-test", "link-widgets-menu");
    var label = a.querySelector("span");   // grab the label before the icon swap adds a 2nd span
    if (label) label.textContent = "Widgets";
    var icon = a.querySelector("ix-icon");
    var glyph = CW.h("span", { style: "display:inline-block;width:24px;text-align:center;font-size:16px" }, ["🧩"]);
    if (icon) icon.replaceWith(glyph);
    a.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); openStoreOverlay(); }, true);
    list.appendChild(wrap);
  }

  // Preferred: a real topbar icon button cloned from "Send Feedback" (same classes/ripple
  // shell, so it matches TrueNAS's own styling instead of us reimplementing it). Falls back
  // to the floating pill button if the topbar markup doesn't match (older/newer WebUI).
  function mountTopbarStoreButton() {
    var feedbackBtn = document.querySelector('.topbar-mobile-footer button[ixtest="leave-feedback"]');
    if (!feedbackBtn) return false;
    var span = feedbackBtn.parentElement;
    var anchor = (span && span.tagName === "SPAN") ? span : feedbackBtn;
    var wrap = anchor.cloneNode(true);
    var btn = wrap.tagName === "BUTTON" ? wrap : wrap.querySelector('button[ixtest="leave-feedback"]');
    if (!btn) return false;
    wrap.id = "cw-store-btn-topbar";
    wrap.removeAttribute("aria-describedby"); wrap.removeAttribute("cdk-describedby-host");
    btn.removeAttribute("id"); btn.removeAttribute("aria-describedby");
    btn.setAttribute("ixtest", "cw-store"); btn.setAttribute("data-test", "button-cw-store");
    btn.setAttribute("aria-label", "Widget Store");
    btn.title = "Browse and install dashboard widgets";
    var icon = btn.querySelector("ix-icon");
    var glyph = CW.h("span", { style: "font-size:19px;line-height:24px;width:24px;height:24px;display:inline-block;text-align:center" }, ["🧩"]);
    if (icon) icon.replaceWith(glyph); else btn.appendChild(glyph);
    btn.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      openStoreOverlay();
    });
    anchor.parentNode.insertBefore(wrap, anchor);
    return true;
  }
  function ensureStoreButton() {
    var onDash = /\/dashboard/.test(location.pathname);
    if (!onDash) {
      var t = document.getElementById("cw-store-btn-topbar"); if (t) t.remove();
      var f = document.getElementById("cw-store-btn-float"); if (f) f.remove();
      return;
    }
    if (document.getElementById("cw-store-btn-topbar")) return;
    try { if (mountTopbarStoreButton()) { var f2 = document.getElementById("cw-store-btn-float"); if (f2) f2.remove(); return; } } catch (e) {}
    if (!document.getElementById("cw-store-btn-float")) {
      var btn = CW.h("a", { id: "cw-store-btn-float", "class": "cw-store-btn", href: "/cw/store",
        title: "Browse and install dashboard widgets", html: "&#129513; Widget Store" });
      btn.addEventListener("click", function (e) { e.preventDefault(); openStoreOverlay(); });
      document.body.appendChild(btn);
    }
  }

  function scan() {
    ensureStoreButton();
    try { mountSidebarNavItem(); } catch (e) {}
    checkPanels();
    getManifest().then(function (m) {
      fixCounts(((m && m.widgets) || []).length);
      document.querySelectorAll("ix-widget-arbitrary-text").forEach(function (host) {
        var m = (host.textContent || "").match(TAG);
        if (m) mountInto(host, m[1], m[2]);
      });
      document.querySelectorAll("ix-widget-arbitrary-text-settings").forEach(augmentSettings);
    }).catch(function () {});
  }

  function start() {
    if (!document.body) return setTimeout(start, 300);
    try { console.info("[CW] Community Widgets loader active (built for TrueNAS SCALE 25.10.x). If the widget picker/cards don't appear, your WebUI version may differ."); } catch (e) {}
    ready(function () {
      CW.style("cw-host-style",
        ".cw-host .card{position:relative}" +
        ".cw-host .card-content{display:flex !important;flex-direction:column;height:100%;box-sizing:border-box;overflow:hidden}" +
        ".cw-host .header{flex:0 0 auto}" +
        ".cw-pick-wrap{margin:0 0 12px}" +
        ".cw-pick-lab{font-size:12px;color:var(--fg2,#9aa4af);margin-bottom:4px}" +
        ".cw-pick{width:100%;background:var(--bg2,#11161e);color:var(--fg1,#e6edf3);border:1px solid var(--lines,rgba(255,255,255,.18));border-radius:6px;padding:8px 10px;font:inherit;box-sizing:border-box}" +
        ".cw-pick-hint{font-size:11px;color:var(--fg2,#9aa4af);margin-top:4px}" +
        ".cw-ro{margin:0 0 12px}.cw-ro-name{font-weight:600;color:var(--fg1,#e6edf3)}" +
        ".cw-store-btn{position:fixed;bottom:18px;right:18px;z-index:99998;background:var(--primary,#4aa8ff);color:#fff;padding:10px 16px;border-radius:24px;font:600 13px Roboto,Arial,sans-serif;text-decoration:none;box-shadow:0 4px 16px rgba(0,0,0,.4);display:flex;align-items:center;gap:6px}" +
        ".cw-store-btn:hover{filter:brightness(1.1)}" +
        ".cw-store-overlay{position:fixed;inset:0;z-index:999999;background:var(--bg1,#11161e);display:none}" +
        ".cw-store-overlay.open{display:block}" +
        ".cw-store-frame{position:absolute;inset:0;width:100%;height:100%;border:0}" +
        ".cw-store-close{position:absolute;top:8px;right:14px;z-index:1;background:transparent;border:0;color:var(--fg1,#e6edf3);font-size:30px;line-height:1;cursor:pointer;opacity:.6;padding:4px 8px}" +
        ".cw-store-close:hover{opacity:1}");
      try { new MutationObserver(function () { scan(); }).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
      scan();
    });
  }
  start();
})();
