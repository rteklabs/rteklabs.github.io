# Property Spot Map Apps Script backend

This folder is a versioned backup/reference for the Apps Script web app that serves published maps and the guarded Google Routes gateway.

## Route safety design

- Route requests are **lazy**: no route request occurs until a client selects a POI.
- The browser sends only map ID, POI index, direction, and mode.
- The server loads the published map JSON and derives the real Google Place IDs itself, so callers cannot use the endpoint as an arbitrary routing proxy.
- Allowed modes: **DRIVING** and **WALKING**.
- Driving is explicitly `TRAFFIC_UNAWARE`.
- Walking uses Google Routes `WALK` mode. Google marks walking routes as beta, so the client must display the pedestrian-path warning whenever Walking is shown.
- Hard application-side cap: **300 route attempts/day**.
- `ROUTES_API_KEY` stays in Apps Script Script Properties; it is never shipped to GitHub Pages.
- The public viewer remains disabled until `PROPERTY_MAP_ROUTES_ENABLED` is deliberately switched to `true`.

## Required Script Properties

Existing:
- `WRITE_KEY`

New:
- `ROUTES_API_KEY` — a separate Google Maps Platform API key restricted to **Routes API only**.

Do not commit either secret to GitHub.

## Deployment

After updating Code.gs in Apps Script, update the existing Web App deployment to a **New version**, keeping:
- Execute as: Me
- Who has access: Anyone

Then verify the existing `/exec` URL still returns the health response before enabling routing in the website.
