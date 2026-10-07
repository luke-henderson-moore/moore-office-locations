# Moore Engineering – Office Locations

A light, minimal web app for finding Moore Engineering offices. Built with the **ArcGIS Maps SDK for JavaScript 4.30**. It reads its data from the Moore ArcGIS Online web map
[`191a9acb395846e0a50d6964247a19a8`](https://mooreengineering.maps.arcgis.com/apps/mapviewer/index.html?webmap=191a9acb395846e0a50d6964247a19a8).

It's a static site with no build step, so you can host it on GitHub Pages as-is.

## Features
- Search offices by name, city, state or ZIP. Press Enter to jump to the first match.
- Filter by state using chips with office counts. Offices outside the filter are dimmed on the map.
- **Find my nearest office:** uses browser location, sorts offices by distance (miles) and opens the closest one.
- Office card with Directions (Google Maps), Call, Email, Copy address and website. Any other layer fields appear under "More details".
- Click a map point to open that office.
- Deep links: `…/#office=<OBJECTID>`.
- Responsive: sidebar on desktop, bottom sheet on phones.
- Moore brand: Roboto, Moore Blue `#004280`, Moore Green `#9acc5b` and the primary Vistal lockup logo.

## Publish on GitHub Pages
1. Go to **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, then **`main` / `(root)`**, and click **Save**.
3. The site will be live at `https://<user>.github.io/moore-office-locations/` within about a minute.

## Sign-in / sharing
- If the web map and office layer are shared with **Everyone (public)**, the app opens without a sign-in.
- If they're shared with the **organization** only, the ArcGIS sign-in dialog appears automatically.
- To use ArcGIS Online / SSO sign-in instead:
  1. In ArcGIS Online, create an **Application** item (Developer credentials → OAuth).
  2. Add your Pages URL as a redirect URI.
  3. Paste the Client ID into `oauthAppId` in `js/config.js`.

## Configuration (`js/config.js`)
| Setting | Purpose |
|---|---|
| `webmapId` / `portalUrl` | Data source web map and ArcGIS org |
| `layerTitle` | Exact title of the office layer. Leave blank to use the first point layer, preferring titles containing "office". |
| `fields.*` | Force field names (name, address, city, state, zip, phone, email, url). Blank fields are auto-detected from field names and aliases. |
| `oauthAppId` | Optional OAuth Client ID |
| `officeZoom` | Zoom level used when an office is selected |

Open the browser console to see which layer and fields were detected: `[Moore Offices] layer: …`.

## Files
```
index.html          page shell
css/styles.css      theme (Moore brand palette)
js/config.js        settings
js/utils.js         pure helpers (field detection, distance, formatting)
js/app.js           map + UI logic
assets/             Moore logo (logo-1..4 tiles) and circle-M favicon
```
