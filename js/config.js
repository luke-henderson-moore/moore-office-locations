/*
 * Moore Office Locations — configuration
 * Edit these values to point the app at a different web map or layer.
 */
window.APP_CONFIG = {
  // Page / header title
  title: "Office Locations",
  subtitle: "Find a Moore Engineering office near you",

  // ArcGIS Online organization + web map used as the data source
  portalUrl: "https://mooreengineering.maps.arcgis.com",
  webmapId: "191a9acb395846e0a50d6964247a19a8",

  // OPTIONAL: ArcGIS OAuth App ID (Client ID).
  // Leave blank and the ArcGIS sign-in dialog appears automatically when
  // the web map is not shared publicly. Add an App ID (with this site's URL
  // as a redirect URI) to use the ArcGIS Online / SSO sign-in page instead.
  oauthAppId: "",

  // OPTIONAL: exact title of the office layer in the web map.
  // Blank = use the first point layer (prefers a title containing "office").
  layerTitle: "",

  // OPTIONAL: force specific field names. Blank = auto-detect from the layer.
  fields: {
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    email: "",
    url: ""
  },

  // Zoom level used when an office is selected
  officeZoom: 13
};
