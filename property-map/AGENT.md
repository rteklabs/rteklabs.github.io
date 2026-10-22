# Property Spot Map — Agent Handoff

Last audited: **2026-10-22**
Documentation baseline: **v1.0.0**
Repository: `rteklabs/rteklabs.github.io`
Project folder: `property-map/`

This file is the durable handoff for future coding agents and maintainers. Read it before changing Property Spot Map. Do not assume remembered chat context is current; verify GitHub, the live site, and Google Drive when a task depends on current state.

## 1. Product purpose

Property Spot Map is a lightweight client-facing property location tool for a Malaysian property agent. It lets the agent create a property map, curate nearby points of interest (POIs), publish a client link, and present the area through:

1. an interactive Google map,
2. the agent's curated POI cards,
3. an expanded full-page card catalogue, and
4. a Google Places UI Kit rich listing.

The design goal is simple client presentation, low operating cost, mobile usability, and minimal administration.

## 2. Live entry points

- Dashboard: https://rteklabs.github.io/property-map/dashboard.html
- Builder: https://rteklabs.github.io/property-map/
- New map: https://rteklabs.github.io/property-map/?new=1&edit=1
- Client viewer format: `https://rteklabs.github.io/property-map/view.html?id=<MAP_ID>`
- GitHub repo: https://github.com/rteklabs/rteklabs.github.io
- Property Map source: https://github.com/rteklabs/rteklabs.github.io/tree/main/property-map
- GitHub Actions: https://github.com/rteklabs/rteklabs.github.io/actions

## 3. Current architecture

```
Builder (GitHub Pages)
        |
        | save/publish
        v
Google Apps Script Web App
        |
        v
Google Drive / Property Spot Maps
        |
        | JSONP read
        v
Client Viewer (GitHub Pages)
        |
        +--> Google Maps JavaScript API
        +--> Places API (New)
        +--> Places UI Kit API
        +--> Apps Script guarded Routes gateway
                    |
                    v
                Routes API
```

### Hosting
Static frontend is hosted on GitHub Pages from the public repo `rteklabs/rteklabs.github.io`.

Deployment workflow:
`.github/workflows/deploy-pages-google-maps.yml`

Workflow name:
**Deploy site with Google Maps config**

It deploys on pushes to `main` and can also be run manually.

### Production browser key
The repo `property-map/config.js` contains only a placeholder.

The real browser key is injected during GitHub Pages deployment from the GitHub Actions secret:

`PROPERTY_MAP_GOOGLE_API_KEY`

Expected browser-key restrictions:
- Website referrer: `https://rteklabs.github.io/*`
- Maps JavaScript API
- Places API (New)
- Places UI Kit API

Never commit the real browser key.

### Google Cloud project
- Display name: **RTEK Property Nearby Places**
- Project ID: `orbital-linker-509613-r0`

### Apps Script / Drive
Apps Script public endpoint is configured in `api-config.js`.

Drive folder:
- Name: **Property Spot Maps**
- Folder ID: `1a5mQZRRuTwMs85pIMvM1ZtquPPTygUY0`

Versioned backend reference:
- `property-map/apps-script/Code.gs`
- `property-map/apps-script/README.md`

Required Apps Script Script Properties:
- `WRITE_KEY`
- `ROUTES_API_KEY`

Never commit either secret.

## 4. File map

### Frontend
- `index.html` — Builder shell
- `app.js` — Builder logic, Google place search, POI management, custom categories, publishing
- `view.html` — Client viewer shell
- `view.js` — client map, POI cards, filters, route UI, expanded view, Google Listing
- `dashboard.html` — saved maps dashboard
- `dashboard.js` — dashboard Edit/View/Copy/Delete flow
- `style.css` — shared styling
- `api-config.js` — Apps Script endpoint and Routes feature flag
- `config.js` — safe local placeholder for browser Maps key
- `privacy.html`, `terms.html`
- `SETUP.md` — infrastructure setup
- `README.md` — human-facing project overview
- `CHANGELOG.md` — release/milestone history

### Backend reference
- `apps-script/Code.gs` — Drive CRUD + route gateway
- `apps-script/README.md` — backend deployment/safety notes

### Static demo/fallback data
- `maps/psm_DEMO0001.json`
- `maps/psm_DEMO2234.json`

Real production maps are stored in Google Drive, not GitHub.

## 5. Current frontend versions

As audited on 2026-10-22:
- Builder JS: `app.js?v=16`
- Builder CSS: `style.css?v=11`
- Viewer JS: `view.js?v=25`
- Viewer CSS: `style.css?v=17`

Latest Property Spot Map code milestone:
- `e350900...` — viewer refresh after guarded Place Details hydration
- corresponding deployment completed successfully

Other repo commits may be newer because the same repository also hosts unrelated RTEK projects.

## 6. Published data model

Current published schema version: **3**

Typical record:

```json
{
  "version": 3,
  "title": "Example Property",
  "client": "Client Name",
  "home": {
    "googlePlaceId": "..."
  },
  "intro": "",
  "customCategories": {},
  "pois": [
    {
      "placeId": "...",
      "category": "grocery",
      "note": ""
    }
  ],
  "id": "psm_XXXXXXXX",
  "publishedAt": "ISO timestamp"
}
```

Important:
- Google Place IDs are the durable identifier.
- Do not redesign the system around permanently caching Google Places content without checking current Google policy.
- Manual POIs can use coordinates/address where no Place ID exists.

## 7. Builder features already implemented

- property-first workflow
- Google place search
- curated POI search/add/remove
- built-in POI categories
- custom categories
- emoji picker
- English and Chinese category names
- local English→Chinese category suggestions
- custom categories travel with published maps
- required-field highlighting
- draft autosave to browser
- published-map recovery for editing from another browser
- JSON export/import
- Dashboard return button
- Google Listing 20-place capacity note/counter
- publish/save through Apps Script to Drive

Built-in categories currently include:
- market
- grocery
- chinese
- school
- transit
- food
- medical
- shopping
- leisure
- other

## 8. Client viewer features already implemented

### Map mode
- Google map
- pulsing home marker
- property return control
- POI markers
- POI cards
- marker/card synchronization
- category filters
- dynamic existing-category filters
- desktop filter scroll arrows
- English / Chinese toggle
- mobile draggable bottom sheet
- Google Maps external links

### Expanded mode
Opened from **⛶ Expand**.

Shows the agent's own full-page POI card catalogue with:
- all POIs
- filters
- category
- distance
- notes
- View on map
- Google Maps link

### Google Listing mode
Opened from top-right **▤ Listing**.

Uses Google Places UI Kit Advanced Place List:
- rich Google place cards
- photos when Google chooses to display them
- ratings
- address/type
- Google Maps integration
- forced light color scheme
- desktop media preference: medium
- mobile/tablet media preference: small

Current product rule:
- Google Listing uses the **first 20 Google-linked POIs**
- Map and Expanded modes can show all POIs
- do not add category filtering to Google Listing unless cost/behaviour is re-evaluated

The component is instantiated lazily and kept alive during the same page visit when switching between Map and Listing.

## 9. Routes subsystem

Routes are enabled with:
`window.PROPERTY_MAP_ROUTES_ENABLED = true`

Supported:
- Driving
- Walking
- reverse direction
- distance
- duration
- animated route path
- in-session route cache

Backend safety:
- browser sends only map ID, POI index, direction and mode
- Apps Script resolves endpoints from the saved map
- no arbitrary public routing proxy
- dedicated server key restricted to Routes API only
- hard application cap: **300 route attempts/day**
- Drive routing is explicitly **TRAFFIC_UNAWARE**
- do not enable traffic-aware routing without explicit cost review and user approval

## 10. Cost-control rules

This project has an explicit standing rule:

> **COST ALARM FIRST.**

Before enabling a billable Google API, changing quotas, enabling a higher-cost SKU, increasing paid usage, or adding a feature that creates meaningful new billable calls:
1. explain the cost implication,
2. state the expected request/event pattern,
3. wait for explicit user approval.

Do not silently enable billable features.

Historical development showed avoidable Place Details usage. Viewer v25 introduced guarded hydration:
- a direct Google Listing visit does not separately fetch Place Details for every POI
- Map/Expanded hydrates when needed
- hydration is guarded against duplicate execution in the same page visit

Re-check current Google pricing before making future cost claims.

## 11. Current Dashboard limitation

This is the largest unfinished architecture item.

The backend already implements `listMaps_()` and can enumerate Drive maps.

However, `dashboard.js` still treats browser localStorage key:

`propertySpotMapLibrary`

as its primary map list.

It reconciles local cards against Drive, but it does not rebuild the dashboard authoritatively from Drive.

Consequence:
- current browser works correctly
- a new browser/PC may not automatically show all published maps

### Recommended next architecture
Make **Drive / Apps Script the authoritative dashboard source**.

Desired flow:
1. Dashboard requests the backend map list through a safe admin/list mechanism.
2. Drive map list populates dashboard.
3. localStorage becomes optional cache only.
4. Edit/View/Copy/Delete continue working.
5. new PC/browser sees the same maps.

Do not weaken the current write-key model merely to make listing easier. Design the read/list boundary deliberately.

## 12. Roadmap

### P1 — Drive-authoritative Dashboard
Highest-value reliability improvement.

### P2 — Duplicate Map
Create a new map ID from an existing map, then allow editing before publish.
Never duplicate using the same map ID.

### P3 — Dashboard quality of life
Potential improvements:
- search
- sort
- client filter
- archive
- quick rename
- tags/status
- last-opened / recent maps

### P4 — Security cleanup
Pending after stabilization:
- rotate previously exposed Routes server API key
- rotate previously exposed WRITE_KEY
- update Apps Script Script Properties
- coordinate browser localStorage reset/re-entry
- optionally remove temporary Apps Script authorization helper if still present

Never rotate these unexpectedly while the live Builder is in use.

### P5 — Documentation maintenance
Keep README, CHANGELOG, SETUP and this file synchronized after meaningful changes.

## 13. Current production map snapshot

As of the 2026-10-22 audit, Drive contained four published maps:
- `psm_5CJEEBLD` — SS2 美发护理 — 10 POIs
- `psm_FTP9TQMU` — Impian Villa — 15 POIs
- `psm_VJB7XB7L` — Jalan Desa Sentosa — 14 POIs
- `psm_QM9WKBGJ` — Jalan Nikmat — 5 POIs

This is a snapshot, not a permanent truth. Re-check Drive before relying on map count or latest published data.

## 14. Safe change rules for future agents

Before editing:
1. fetch the current GitHub file and SHA,
2. inspect the existing implementation,
3. keep changes narrowly scoped,
4. preserve known-good client behaviour,
5. bump the relevant cache query version when changing JS/CSS,
6. verify GitHub Actions deployment,
7. test desktop and mobile when UI is affected.

Do not:
- commit browser/server secrets,
- remove route caps casually,
- enable traffic-aware routes casually,
- replace Drive storage without a migration plan,
- destroy existing map IDs,
- assume localStorage is the canonical production database,
- introduce paid API behaviour without a cost alarm,
- scrape/cache Google place photos/content outside permitted usage,
- rewrite unrelated RTEK projects in the shared repo.

## 15. Deployment checklist

For frontend changes:
1. update files on `main`
2. bump `?v=` cache query when appropriate
3. confirm **Deploy site with Google Maps config** succeeds
4. hard-refresh the live page
5. test live client map

For Apps Script changes:
1. update `property-map/apps-script/Code.gs` reference
2. copy/deploy corresponding code in Apps Script
3. Deploy → Manage deployments → active Web App → New version
4. keep Execute as: Me
5. keep access: Anyone
6. confirm the existing `/exec` health endpoint
7. test save/read/delete/route as relevant

GitHub reference code does **not** automatically deploy Apps Script.

## 16. How to resume this project after a long gap

Start here:
1. read this file
2. read `README.md`
3. read latest `CHANGELOG.md`
4. inspect current `property-map/` directory
5. check latest Property Map commits
6. check live Dashboard
7. check Drive folder
8. verify Apps Script health only if backend work is needed
9. identify the smallest next improvement

Current recommended next move:
**Drive-authoritative Dashboard**, then **Duplicate Map**.
