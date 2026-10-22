# Property Spot Map Changelog

This project existed before formal semantic versioning. The entries below reconstruct the important milestones and establish **v1.0.0** as the documented operational baseline.

## [Unreleased]

Planned / candidate work:
- Drive-authoritative Dashboard
- Duplicate Map
- Dashboard search/sort/client filtering/archive
- security rotation for previously exposed operational secrets
- ongoing documentation maintenance

## [1.0.0] — 2026-10-22 documentation baseline

Status: **operational production baseline**

This release label documents the system that was already live by the 2026-10-22 audit. It is not yet represented by a Git tag.

### Core platform
- GitHub Pages static frontend
- Google Maps JavaScript integration
- Places API (New)
- Google Apps Script publishing/read backend
- Google Drive JSON map storage
- client short-link format using `psm_XXXXXXXX` IDs

### Builder
- property and POI Google search
- draft autosave
- publish/save workflow
- cross-browser recovery of published map for editing
- JSON export/import
- required-field guidance
- Dashboard navigation
- built-in POI categories
- custom category creation
- emoji picker
- bilingual custom category names
- common English→Chinese category suggestions
- Google Listing 20-place notice/counter

### Dashboard
- saved map cards
- Edit
- View
- Copy link
- Delete from Drive
- stale local-card reconciliation against backend

Known limitation:
Dashboard remains localStorage-primary rather than Drive-authoritative.

### Client viewer
- dynamic category filters
- marker ↔ card synchronization
- pulsing home marker
- return-to-property control
- mobile draggable bottom sheet
- responsive desktop/mobile layout
- English/Chinese toggle
- external Google Maps links

### Routing
- Apps Script guarded Routes gateway
- Driving and Walking
- reverse direction
- duration and distance
- animated route polyline
- in-session route cache
- `TRAFFIC_UNAWARE` driving
- hard 300 route-attempt/day application cap

### Expanded places view
- full-page agent-curated POI catalogue
- filters
- notes
- distance
- View on map
- Google Maps link

### Google Listing
- Places UI Kit Advanced Place List
- rich Google place cards
- light theme
- responsive media preference
- first 20 Google-linked POIs
- lazy instantiation
- same live component reused while switching views in the same page visit

### Cost optimization
Viewer hydration was guarded to reduce unnecessary Places Place Details calls:
- direct Listing visits do not separately hydrate every POI
- Map/Expanded hydrate only when needed
- duplicate hydration is avoided in the same page visit

Relevant final viewer milestone:
- `99f7a669...` — Avoid duplicate and unnecessary Place Details hydration
- `e350900...` — Refresh viewer for guarded place hydration

## Pre-1.0 milestone history

### Custom categories
- reusable custom POI categories
- viewer support
- local category library
- Chinese suggestion dictionary

### All Places / Expanded browsing
- automatic full-page nearby-place catalogue
- responsive cards
- category filtering
- direct focus back to map

### Viewer service resilience
- Apps Script map-load retry
- longer second-attempt timeout
- sessionStorage fallback cache
- static-map fallback retained

### Dashboard reliability
- published-map recovery for Builder
- backend Drive deletion
- stale local dashboard reconciliation

### Routes introduction
- server-only Routes key
- allowlisted modes
- explicit no-traffic routing
- daily application cap
