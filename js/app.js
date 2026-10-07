/*
 * Moore Office Locations — ArcGIS Maps SDK for JavaScript 4.30
 * Data source: the web map configured in js/config.js
 */
require([
  "esri/config",
  "esri/WebMap",
  "esri/views/MapView",
  "esri/Graphic",
  "esri/identity/IdentityManager",
  "esri/identity/OAuthInfo",
  "esri/widgets/Home",
  "esri/geometry/Point",
  "esri/geometry/Extent"
], function (esriConfig, WebMap, MapView, Graphic, IdentityManager, OAuthInfo, Home, Point, Extent) {
  "use strict";

  var CFG = window.APP_CONFIG || {};
  var U = window.OfficeUtils;
  var $ = function (id) { return document.getElementById(id); };

  var els = {
    title: $("app-title"), subtitle: $("app-subtitle"),
    search: $("search-input"), clear: $("search-clear"),
    nearest: $("nearest-btn"), chips: $("state-chips"),
    status: $("status"), list: $("office-list"), detail: $("detail"),
    loader: $("loader"), loaderText: $("loader-text"),
    signout: $("signout-btn"), panel: $("panel")
  };

  var state = {
    offices: [], byOid: {}, query: "", stateFilter: "",
    selected: null, userLoc: null, layer: null, layerView: null,
    highlight: null, roles: {}, oidField: "OBJECTID", fieldAliases: {}
  };

  // ---------- Init text ----------
  document.title = (CFG.title || "Office Locations") + " | Moore Engineering, Inc.";
  els.title.textContent = CFG.title || "Office Locations";
  if (CFG.subtitle) els.subtitle.textContent = CFG.subtitle;
  $("year").textContent = new Date().getFullYear();

  // ---------- Auth ----------
  esriConfig.portalUrl = CFG.portalUrl || "https://www.arcgis.com";
  if (CFG.oauthAppId) {
    IdentityManager.registerOAuthInfos([new OAuthInfo({
      appId: CFG.oauthAppId, portalUrl: esriConfig.portalUrl, popup: false, flowType: "auto"
    })]);
  }
  function refreshSignOut() {
    els.signout.hidden = !(IdentityManager.credentials && IdentityManager.credentials.length);
  }
  IdentityManager.on("credential-create", refreshSignOut);
  els.signout.addEventListener("click", function () {
    IdentityManager.destroyCredentials();
    window.location.reload();
  });

  // ---------- Map ----------
  var map = new WebMap({ portalItem: { id: CFG.webmapId } });
  var view = new MapView({
    container: "map",
    map: map,
    popupEnabled: false,
    ui: { components: ["zoom", "attribution"] },
    constraints: { snapToZoom: false }
  });
  view.ui.move("zoom", "top-right");
  view.ui.add(new Home({ view: view }), "top-right");

  var userGraphic = null;

  function showLoader(text, isError, actionHtml) {
    els.loader.classList.remove("hidden");
    els.loader.classList.toggle("error", !!isError);
    els.loaderText.innerHTML = U.escapeHtml(text) + (actionHtml || "");
  }
  function hideLoader() { els.loader.classList.add("hidden"); }

  function pickLayer() {
    var pts = map.allLayers.filter(function (l) {
      return l.type === "feature" && l.geometryType === "point";
    }).toArray();
    if (CFG.layerTitle) {
      var t = CFG.layerTitle.toLowerCase();
      var exact = pts.filter(function (l) { return (l.title || "").toLowerCase() === t; })[0];
      if (exact) return exact;
    }
    var office = pts.filter(function (l) { return /office|location|branch/i.test(l.title || ""); })[0];
    // allLayers is bottom-to-top; prefer the top-most point layer as fallback
    return office || pts[pts.length - 1] || null;
  }

  function queryAll(layer) {
    var out = [];
    var pageSize = Math.min(layer.capabilities && layer.capabilities.query && layer.capabilities.query.maxRecordCount || 1000, 2000);
    function page(start) {
      var q = layer.createQuery();
      q.where = layer.definitionExpression || "1=1";
      q.outFields = ["*"];
      q.returnGeometry = true;
      q.outSpatialReference = { wkid: 4326 };
      q.start = start;
      q.num = pageSize;
      return layer.queryFeatures(q).then(function (fs) {
        out = out.concat(fs.features);
        if (fs.exceededTransferLimit && fs.features.length) return page(start + fs.features.length);
        return out;
      });
    }
    var supportsPaging = layer.capabilities && layer.capabilities.query && layer.capabilities.query.supportsPagination;
    if (supportsPaging) return page(0);
    var q = layer.createQuery();
    q.where = layer.definitionExpression || "1=1";
    q.outFields = ["*"];
    q.returnGeometry = true;
    q.outSpatialReference = { wkid: 4326 };
    return layer.queryFeatures(q).then(function (fs) { return fs.features; });
  }

  view.when(function () {
    refreshSignOut();
    showLoader("Loading offices…");
    return map.loadAll().then(function () {
      var layer = pickLayer();
      if (!layer) throw new Error("No point layer was found in the web map.");
      state.layer = layer;
      return layer.load();
    }).then(function () {
      var layer = state.layer;
      state.oidField = layer.objectIdField;
      layer.fields.forEach(function (f) { state.fieldAliases[f.name] = f.alias || f.name; });
      state.roles = U.detectFields(layer.fields, CFG.fields, layer.displayField);
      if (window.console) console.info("[Moore Offices] layer:", layer.title, "fields:", state.roles);
      return Promise.all([queryAll(layer), view.whenLayerView(layer)]);
    }).then(function (res) {
      state.layerView = res[1];
      state.offices = res[0].map(function (g) {
        var geom = g.geometry;
        var o = U.toOffice(g.attributes, state.roles, state.oidField,
          geom ? geom.latitude != null ? geom.latitude : geom.y : null,
          geom ? geom.longitude != null ? geom.longitude : geom.x : null);
        return o;
      }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      state.offices.forEach(function (o) { state.byOid[o.oid] = o; });
      buildChips();
      render();
      hideLoader();
      bindMapClicks();
      restoreFromHash();
    });
  }).catch(function (err) {
    console.error(err);
    var msg = (err && err.message) || "The map could not be loaded.";
    var auth = err && (err.name === "identity-manager:user-aborted" || /abort|cancel|token|not authorized|403|499/i.test(msg + " " + (err.name || "")));
    showLoader(auth
      ? "Sign in with your Moore ArcGIS account to view office locations."
      : "We couldn’t load the office map. " + msg,
      true,
      '<br><button class="btn-primary" type="button" onclick="location.reload()">Try again</button>');
    els.status.textContent = "";
  });

  // ---------- Filters ----------
  function buildChips() {
    var counts = {};
    state.offices.forEach(function (o) { if (o.state) counts[o.state] = (counts[o.state] || 0) + 1; });
    var states = Object.keys(counts).sort();
    els.chips.innerHTML = "";
    if (states.length < 2) { els.chips.hidden = true; return; }
    var make = function (val, label, n) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "chip"; b.dataset.state = val;
      b.setAttribute("aria-pressed", String(state.stateFilter === val));
      b.innerHTML = U.escapeHtml(label) + '<span class="count">' + n + "</span>";
      b.addEventListener("click", function () { setStateFilter(val); });
      els.chips.appendChild(b);
    };
    make("", "All", state.offices.length);
    states.forEach(function (s) { make(s, s, counts[s]); });
  }

  function setStateFilter(val) {
    state.stateFilter = val;
    Array.prototype.forEach.call(els.chips.children, function (c) {
      c.setAttribute("aria-pressed", String(c.dataset.state === val));
    });
    closeDetail(true);
    render();
    zoomToVisible();
  }

  function visibleOffices() {
    var list = state.offices.filter(function (o) {
      return (!state.stateFilter || o.state === state.stateFilter) && U.matchesQuery(o, state.query);
    });
    if (state.userLoc) {
      var dist = function (o) { return o.distance == null ? Infinity : o.distance; };
      list = list.slice().sort(function (a, b) { return dist(a) - dist(b); });
    }
    return list;
  }

  function applyMapEffect(list) {
    if (!state.layerView) return;
    var filtered = state.stateFilter || state.query;
    if (!filtered) { state.layerView.featureEffect = null; return; }
    var ids = list.map(function (o) { return o.oid; });
    state.layerView.featureEffect = {
      filter: { objectIds: ids.length ? ids : [-1] },
      excludedEffect: "grayscale(100%) opacity(25%)"
    };
  }

  function zoomToVisible() {
    var list = visibleOffices().filter(function (o) { return o.lat != null; });
    if (!list.length) return;
    if (list.length === 1) { view.goTo({ center: [list[0].lon, list[0].lat], zoom: CFG.officeZoom || 13 }).catch(noop); return; }
    var xs = list.map(function (o) { return o.lon; }), ys = list.map(function (o) { return o.lat; });
    view.goTo({
      target: new Extent({
        spatialReference: { wkid: 4326 },
        xmin: Math.min.apply(null, xs), xmax: Math.max.apply(null, xs),
        ymin: Math.min.apply(null, ys), ymax: Math.max.apply(null, ys)
      })
    }, { duration: 600 }).then(function () {
      view.goTo({ zoom: view.zoom - 0.4 }, { duration: 200 }).catch(noop);
    }).catch(noop);
  }

  // ---------- List rendering ----------
  function render() {
    var list = visibleOffices();
    applyMapEffect(list);
    els.list.innerHTML = "";
    var total = state.offices.length;
    els.status.textContent = list.length === total
      ? total + (total === 1 ? " office" : " offices")
      : list.length + " of " + total + " offices";
    if (state.userLoc) els.status.textContent += " · sorted by distance";

    if (!list.length) {
      els.list.innerHTML = '<li class="empty"><strong>No offices match your search</strong>Try a different city, state or office name.</li>';
      return;
    }
    var frag = document.createDocumentFragment();
    list.forEach(function (o, i) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button"; b.className = "office"; b.dataset.oid = o.oid;
      if (state.selected && state.selected.oid === o.oid) b.setAttribute("aria-current", "true");
      var initials = (o.state || o.name || "?").slice(0, 2).toUpperCase();
      var addr = [o.address, o.cityLine].filter(Boolean).join(", ");
      b.innerHTML =
        '<span class="office-pin" aria-hidden="true">' + U.escapeHtml(state.userLoc ? String(i + 1) : initials) + "</span>" +
        '<span class="office-body"><span class="office-name">' + U.escapeHtml(o.name) + "</span>" +
        (addr ? '<span class="office-addr">' + U.escapeHtml(addr) + "</span>" : "") +
        (o.phone ? '<span class="office-addr">' + U.escapeHtml(o.phone) + "</span>" : "") +
        "</span>" +
        (o.distance != null ? '<span class="office-dist">' + U.formatMiles(o.distance) + "</span>" : "");
      b.addEventListener("click", function () { selectOffice(o, true); });
      li.appendChild(b);
      frag.appendChild(li);
    });
    els.list.appendChild(frag);
  }

  // ---------- Detail ----------
  var ICON = {
    pin: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>',
    mail: '<svg viewBox="0 0 24 24"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    web: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 6h-2.9a15.7 15.7 0 0 0-1.4-3.6A8 8 0 0 1 18.9 8zM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4zM4.3 14a8.2 8.2 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3zm.8 2h2.9c.3 1.3.8 2.5 1.4 3.6A8 8 0 0 1 5.1 16zM8 8H5.1a8 8 0 0 1 4.3-3.6C8.8 5.5 8.3 6.7 8 8zm4 12c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4zm.3 5.6c.6-1.1 1.1-2.3 1.4-3.6h2.9a8 8 0 0 1-4.3 3.6zm1.8-5.6a16.5 16.5 0 0 0 0-4h3.4a8.2 8.2 0 0 1 0 4h-3.4z"/></svg>',
    dir: '<svg viewBox="0 0 24 24"><path d="M21.7 11.3l-9-9a1 1 0 0 0-1.4 0l-9 9a1 1 0 0 0 0 1.4l9 9a1 1 0 0 0 1.4 0l9-9a1 1 0 0 0 0-1.4zM14 14.5V12h-4v3H8v-4a1 1 0 0 1 1-1h5V7.5l3.5 3.5-3.5 3.5z"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><path d="M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20v-2z"/></svg>'
  };

  function renderDetail(o) {
    var e = U.escapeHtml;
    var fullAddr = [o.address, o.cityLine].filter(Boolean).join(", ");
    var roleFields = Object.keys(state.roles).map(function (k) { return state.roles[k]; });
    var extras = Object.keys(o.attributes).filter(function (k) {
      var v = o.attributes[k];
      return roleFields.indexOf(k) === -1 && k !== state.oidField && !U.isSystemField(k) &&
        v !== null && v !== undefined && String(v).trim() !== "";
    });

    var html =
      '<button type="button" class="back" id="back-btn">' + ICON.back + "All offices</button>" +
      "<h2>" + e(o.name) + "</h2>" +
      (o.distance != null ? '<p class="dist-line">' + U.formatMiles(o.distance) + " from your location</p>" : "") +
      '<div class="accent" aria-hidden="true"></div>' +
      '<div class="actions">' +
        '<a class="action primary" target="_blank" rel="noopener" href="' + e(U.directionsUrl(o)) + '">' + ICON.dir + "Directions</a>" +
        (o.phone ? '<a class="action" href="' + e(U.telHref(o.phone)) + '">' + ICON.phone + "Call</a>" : "") +
        (o.email ? '<a class="action" href="mailto:' + e(o.email) + '">' + ICON.mail + "Email</a>" : "") +
        (fullAddr ? '<button type="button" class="action" id="copy-btn">' + ICON.copy + '<span>Copy address</span></button>' : "") +
      "</div>" +
      '<ul class="info">' +
        (fullAddr ? "<li>" + ICON.pin + "<span>" + e(o.address) + (o.address && o.cityLine ? "<br>" : "") + e(o.cityLine) + "</span></li>" : "") +
        (o.phone ? "<li>" + ICON.phone + '<a href="' + e(U.telHref(o.phone)) + '">' + e(o.phone) + "</a></li>" : "") +
        (o.email ? "<li>" + ICON.mail + '<a href="mailto:' + e(o.email) + '">' + e(o.email) + "</a></li>" : "") +
        (o.url ? "<li>" + ICON.web + '<a target="_blank" rel="noopener" href="' + e(o.url) + '">' + e(o.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) + "</a></li>" : "") +
      "</ul>";

    if (extras.length) {
      html += '<details class="more"><summary>More details</summary><dl>' +
        extras.map(function (k) {
          var v = o.attributes[k];
          var field = state.layer.getField(k);
          if (field && field.type === "date" && typeof v === "number") v = new Date(v).toLocaleDateString();
          var url = typeof v === "string" && /^https?:\/\//i.test(v) ? U.safeUrl(v) : "";
          return "<dt>" + e(state.fieldAliases[k] || k) + "</dt><dd>" +
            (url ? '<a target="_blank" rel="noopener" href="' + e(url) + '">' + e(v) + "</a>" : e(v)) + "</dd>";
        }).join("") + "</dl></details>";
    }

    els.detail.innerHTML = html;
    $("back-btn").addEventListener("click", function () { closeDetail(); });
    var copy = $("copy-btn");
    if (copy) copy.addEventListener("click", function () {
      var done = function () { copy.querySelector("span").textContent = "Copied"; setTimeout(function () { copy.querySelector("span").textContent = "Copy address"; }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(fullAddr).then(done, noop);
    });
  }

  function selectOffice(o, zoom) {
    state.selected = o;
    if (state.highlight) { state.highlight.remove(); state.highlight = null; }
    if (state.layerView) state.highlight = state.layerView.highlight(o.oid);
    renderDetail(o);
    els.list.hidden = true; els.chips.hidden = true;
    els.status.hidden = true;
    els.detail.hidden = false;
    els.panel.scrollTop = 0;
    history.replaceState(null, "", "#office=" + encodeURIComponent(o.oid));
    if (zoom && o.lat != null) {
      view.goTo({ center: [o.lon, o.lat], zoom: Math.max(view.zoom, CFG.officeZoom || 13) }, { duration: 700 }).catch(noop);
    }
    var back = $("back-btn"); if (back) back.focus({ preventScroll: true });
  }

  function closeDetail(silent) {
    if (state.highlight) { state.highlight.remove(); state.highlight = null; }
    var prev = state.selected;
    state.selected = null;
    els.detail.hidden = true; els.detail.innerHTML = "";
    els.list.hidden = false; els.status.hidden = false;
    els.chips.hidden = els.chips.children.length < 2;
    history.replaceState(null, "", location.pathname + location.search);
    if (!silent) {
      render();
      if (prev) {
        var btn = els.list.querySelector('[data-oid="' + CSS.escape(String(prev.oid)) + '"]');
        if (btn) { btn.focus({ preventScroll: false }); }
      }
    }
  }

  function bindMapClicks() {
    view.on("click", function (evt) {
      view.hitTest(evt, { include: [state.layer] }).then(function (res) {
        var hit = res.results.filter(function (r) { return r.graphic && r.graphic.layer === state.layer; })[0];
        if (!hit) return;
        var o = state.byOid[hit.graphic.attributes[state.oidField]];
        if (o) selectOffice(o, true);
      }).catch(noop);
    });
    view.on("pointer-move", function (evt) {
      view.hitTest(evt, { include: [state.layer] }).then(function (res) {
        view.container.style.cursor = res.results.length ? "pointer" : "";
      }).catch(noop);
    });
  }

  function restoreFromHash() {
    var m = /office=([^&]+)/.exec(location.hash);
    if (!m) return;
    var o = state.byOid[decodeURIComponent(m[1])];
    if (o) view.when(function () { selectOffice(o, true); });
  }

  // ---------- Search ----------
  var t;
  els.search.addEventListener("input", function () {
    els.clear.hidden = !els.search.value;
    clearTimeout(t);
    t = setTimeout(function () {
      state.query = els.search.value;
      if (state.selected) closeDetail(true);
      render();
    }, 120);
  });
  els.search.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var first = visibleOffices()[0];
      if (first) selectOffice(first, true);
    } else if (e.key === "Escape") {
      els.clear.click();
    }
  });
  els.clear.addEventListener("click", function () {
    els.search.value = ""; els.clear.hidden = true; state.query = "";
    render(); els.search.focus();
  });

  // ---------- Nearest office ----------
  els.nearest.addEventListener("click", function () {
    if (!navigator.geolocation) { els.status.textContent = "Location isn’t available in this browser."; return; }
    els.nearest.setAttribute("aria-busy", "true");
    els.status.textContent = "Finding your location…";
    navigator.geolocation.getCurrentPosition(function (pos) {
      els.nearest.removeAttribute("aria-busy");
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      state.userLoc = { lat: lat, lon: lon };
      state.offices.forEach(function (o) {
        o.distance = o.lat != null ? U.distanceMiles(lat, lon, o.lat, o.lon) : null;
      });
      if (userGraphic) view.graphics.remove(userGraphic);
      userGraphic = new Graphic({
        geometry: new Point({ latitude: lat, longitude: lon }),
        symbol: { type: "simple-marker", style: "circle", size: 14, color: "#2791d0", outline: { color: "#ffffff", width: 3 } }
      });
      view.graphics.add(userGraphic);
      state.stateFilter = ""; state.query = ""; els.search.value = ""; els.clear.hidden = true;
      Array.prototype.forEach.call(els.chips.children, function (c) { c.setAttribute("aria-pressed", String(c.dataset.state === "")); });
      closeDetail(true);
      render();
      var nearest = visibleOffices()[0];
      if (nearest) {
        selectOffice(nearest, false);
        view.goTo([userGraphic.geometry, new Point({ latitude: nearest.lat, longitude: nearest.lon })], { duration: 800 })
          .then(function () { if (view.zoom > 14) view.goTo({ zoom: 14 }); return view.goTo({ zoom: view.zoom - 0.6 }); }).catch(noop);
      }
    }, function (err) {
      els.nearest.removeAttribute("aria-busy");
      els.status.textContent = err.code === 1
        ? "Location access was blocked. Allow location in your browser to find the nearest office."
        : "We couldn’t determine your location. Try again or search by city.";
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  });

  function noop() {}
});
