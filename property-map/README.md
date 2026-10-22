# Property Spot Map

**Current documented release: v1.0.0 — Operational Baseline**  
Last full audit: **2026-10-22**

Property Spot Map is a lightweight property-agent presentation tool that combines a main property location with a curated set of nearby places. It is designed for quick client sharing on desktop and mobile.

## Live app

- Dashboard: https://rteklabs.github.io/property-map/dashboard.html
- Builder: https://rteklabs.github.io/property-map/
- New map: https://rteklabs.github.io/property-map/?new=1&edit=1
- Client viewer: `https://rteklabs.github.io/property-map/view.html?id=<MAP_ID>`

## What v1.0.0 can do

### Builder
- choose a property through Google Places
- add curated nearby POIs
- use built-in or custom categories
- add emoji-based custom categories
- English/Chinese category labels
- automatic common Chinese category suggestions
- publish maps to Google Drive through Apps Script
- recover published maps for editing
- export/import JSON
- warn that Google Listing shows at most 20 Google-linked POIs

### Client viewer
- interactive Google Map
- responsive POI cards and filters
- mobile draggable bottom sheet
- Map / Expanded / Google Listing views
- Google Places UI Kit rich listing
- Drive and Walking route display
- route distance/duration
- reverse route
- animated route line
- English/Chinese toggle
- copyable client link

## Architecture

```
GitHub Pages frontend
   |
   +-- Maps JavaScript API
   +-- Places API (New)
   +-- Places UI Kit API
   |
   +-- Apps Script Web App
          |
          +-- Google Drive JSON storage
          +-- guarded Routes API gateway
```

Production map data lives in the Google Drive folder **Property Spot Maps**.

The real browser Google Maps key is injected by GitHub Actions from the repository secret `PROPERTY_MAP_GOOGLE_API_KEY`. The committed `config.js` contains only a placeholder.

## Current versions

- Builder: `app.js?v=16`
- Builder CSS: `style.css?v=11`
- Viewer: `view.js?v=25`
- Viewer CSS: `style.css?v=17`
- Published map schema: **v3**

These query-string numbers are cache-busting asset revisions, not semantic product versions.

## Product versioning

From this documentation baseline onward:

- **MAJOR** — incompatible architecture/data/client-link change
- **MINOR** — new user-facing feature or substantial workflow improvement
- **PATCH** — bug fix, styling fix, performance/cost optimization, documentation-only correction

Current semantic baseline: **v1.0.0**

Likely next release:
**v1.1.0 — Drive-authoritative Dashboard + workflow improvements**

There is not yet a Git tag corresponding to v1.0.0; this version marks the documented operational baseline.

## Known limitations / next work

### Highest priority
The Dashboard still uses browser `localStorage` as its primary list. The backend already knows how to list maps from Drive, so the next reliability upgrade is to make Drive the authoritative Dashboard source.

### Next
Add **Duplicate Map** so an existing area/map can become a new map with a fresh ID.

### Later
- Dashboard search/sort/filter/archive
- security key rotation
- documentation upkeep
- selective UI improvements based on actual client use

## Cost and security principles

- Warn before introducing any new billable Google API behaviour.
- Keep Routes driving mode `TRAFFIC_UNAWARE` unless explicitly reviewed.
- Keep the 300/day application-side route cap.
- Never commit real API keys or the WRITE_KEY.
- Re-check current Google pricing and Places policy before changing API usage/caching behaviour.

## Documentation

- **AGENT.md** — durable technical handoff and roadmap for future agents/developers
- **CHANGELOG.md** — project milestones and semantic-version baseline
- **SETUP.md** — Google Cloud / GitHub Pages setup
- **apps-script/README.md** — backend and Routes safety/deployment notes

If returning after a long gap, start with **AGENT.md**.
