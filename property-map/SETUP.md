# Property Spot Map: Google Maps setup

The repository's `config.js` intentionally contains only `YOUR_GOOGLE_MAPS_API_KEY`.
The production Pages workflow generates a working `config.js` in the deployed
artifact from a GitHub Actions secret. The browser key is visible to site visitors;
its Google Cloud restrictions provide the protection.

1. In Google Cloud, enable **Maps JavaScript API** and **Places API (New)**.
2. Restrict the browser key to **Websites**: `https://rteklabs.github.io/*`.
3. Under **API restrictions**, select **Restrict key** and allow only those two APIs.
4. In `rteklabs/rteklabs.github.io`, open **Settings → Secrets and variables → Actions → New repository secret**. Name it `PROPERTY_MAP_GOOGLE_API_KEY`; paste the restricted browser key as its value.
5. Open **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
6. Open **Actions → Deploy site with Google Maps config → Run workflow** on `main`.

That workflow publishes the whole existing static site and generates
`property-map/config.js` only in the Pages artifact. It does not commit the real key.
Google place IDs are stored in share links and JSON exports; the browser loads
current place details from Google on each visit. Existing manually added locations
continue to work.

For local development only, you can temporarily replace the placeholder in your
local `property-map/config.js`. Do not commit that local change.
