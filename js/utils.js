/*
 * Pure helper functions (no ArcGIS dependency) — unit-testable in Node.
 */
(function (root) {
  "use strict";

  var CANDIDATES = {
    name: ["officename", "office_name", "office", "name", "locationname", "location_name",
      "branch", "branchname", "sitename", "site", "facility", "title", "location"],
    address: ["address", "streetaddress", "street_address", "address1", "addr", "street",
      "fulladdress", "full_address", "matchaddr", "match_addr", "place_addr"],
    city: ["city", "town", "municipality", "cityname"],
    state: ["state", "st", "stateabbr", "state_abbr", "statecode", "region", "province"],
    zip: ["zip", "zipcode", "zip_code", "postal", "postalcode", "postal_code", "zip5"],
    phone: ["phone", "phonenumber", "phone_number", "telephone", "tel", "officephone", "mainphone"],
    email: ["email", "e_mail", "emailaddress", "mail"],
    url: ["url", "website", "web", "webpage", "link", "officeurl", "pageurl"]
  };

  var SYSTEM_FIELD = /^(objectid|fid|oid|globalid|shape|shape_.*|shape__.*|st_area.*|st_length.*|created_user|created_date|last_edited_user|last_edited_date|creationdate|creator|editdate|editor|x|y|lat|latitude|lon|long|longitude)$/i;

  function norm(s) {
    return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  /** Detect role -> field name from a list of {name, alias, type}. */
  function detectFields(fields, overrides, displayField) {
    overrides = overrides || {};
    var usable = (fields || []).filter(function (f) {
      return f && f.name && ["esriFieldTypeString", "string", "esriFieldTypeInteger", "integer",
        "esriFieldTypeSmallInteger", "small-integer", "esriFieldTypeDouble", "double", undefined]
        .indexOf(f.type) !== -1 && !SYSTEM_FIELD.test(f.name);
    });
    var used = {};
    var out = {};
    Object.keys(CANDIDATES).forEach(function (role) {
      if (overrides[role]) { out[role] = overrides[role]; used[overrides[role]] = true; }
    });
    Object.keys(CANDIDATES).forEach(function (role) {
      if (out[role]) return;
      var cands = CANDIDATES[role].map(norm);
      var hit = null;
      // 1) exact match on name or alias, in candidate priority order
      for (var i = 0; i < cands.length && !hit; i++) {
        for (var j = 0; j < usable.length; j++) {
          var f = usable[j];
          if (used[f.name]) continue;
          if (norm(f.name) === cands[i] || norm(f.alias) === cands[i]) { hit = f; break; }
        }
      }
      // 2) contains match for longer candidates (avoids "st" matching "street")
      for (var k = 0; k < cands.length && !hit; k++) {
        if (cands[k].length < 4) continue;
        for (var m = 0; m < usable.length; m++) {
          var g = usable[m];
          if (used[g.name]) continue;
          if (norm(g.name).indexOf(cands[k]) !== -1 || norm(g.alias).indexOf(cands[k]) !== -1) { hit = g; break; }
        }
      }
      if (hit) { out[role] = hit.name; used[hit.name] = true; }
    });
    if (!out.name && displayField) out.name = displayField;
    return out;
  }

  function isSystemField(name) { return SYSTEM_FIELD.test(name || ""); }

  function clean(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  /** Haversine distance in miles. */
  function distanceMiles(lat1, lon1, lat2, lon2) {
    var R = 3958.8, toRad = Math.PI / 180;
    var dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function formatMiles(mi) {
    if (mi < 0.1) return "< 0.1 mi";
    if (mi < 10) return mi.toFixed(1) + " mi";
    return Math.round(mi).toLocaleString("en-US") + " mi";
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function telHref(phone) {
    var digits = String(phone || "").replace(/[^0-9+]/g, "");
    return digits ? "tel:" + digits : "";
  }

  function safeUrl(u) {
    u = clean(u);
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try { var p = new URL(u); return (p.protocol === "http:" || p.protocol === "https:") ? p.href : ""; }
    catch (e) { return ""; }
  }

  /** Build a normalized office record from raw attributes + lat/lon. */
  function toOffice(attrs, roles, oidField, lat, lon) {
    var g = function (r) { return roles[r] ? clean(attrs[roles[r]]) : ""; };
    var city = g("city"), state = g("state"), zip = g("zip");
    if (state.length <= 3) state = state.toUpperCase();
    var cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    var address = g("address");
    // If the address field already contains the city, don't repeat it
    if (address && city && address.toLowerCase().indexOf(", " + city.toLowerCase()) !== -1) cityLine = "";
    var name = g("name") || city || ("Office " + attrs[oidField]);
    return {
      oid: attrs[oidField],
      name: name,
      address: address,
      cityLine: cityLine,
      city: city,
      state: state,
      zip: zip,
      phone: g("phone"),
      email: g("email"),
      url: safeUrl(g("url")),
      lat: lat,
      lon: lon,
      attributes: attrs,
      search: [name, address, city, state, zip].join(" ").toLowerCase()
    };
  }

  function matchesQuery(office, q) {
    q = clean(q).toLowerCase();
    if (!q) return true;
    return q.split(/\s+/).every(function (t) { return office.search.indexOf(t) !== -1; });
  }

  function directionsUrl(o) {
    var dest = (o.lat !== null && o.lat !== undefined) ? (o.lat + "," + o.lon)
      : [o.address, o.cityLine].filter(Boolean).join(", ");
    return "https://www.google.com/maps/dir/?api=1&destination=" + encodeURIComponent(dest);
  }

  var api = {
    detectFields: detectFields, isSystemField: isSystemField, distanceMiles: distanceMiles,
    formatMiles: formatMiles, escapeHtml: escapeHtml, telHref: telHref, safeUrl: safeUrl,
    toOffice: toOffice, matchesQuery: matchesQuery, directionsUrl: directionsUrl, clean: clean
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.OfficeUtils = api;
})(typeof window !== "undefined" ? window : globalThis);
