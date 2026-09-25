'use strict';

const FOLDER_ID = '1a5mQZRRuTwMs85pIMvM1ZtquPPTygUY0';
const ID_PATTERN = /^psm_[A-Z2-9]{8}$/;
const ROUTE_DAILY_LIMIT = 300;
const ROUTE_MODE_ALLOWLIST = { DRIVING: 'DRIVE', WALKING: 'WALK' };

function doGet(e) {
  const p = (e && e.parameter) || {};
  const callback = p.callback || '';

  try {
    if (p.action === 'route') {
      return json(routeRequest_(p), callback);
    }

    if (!p.id) {
      return json({ ok: true, service: 'Property Spot Map API' }, callback);
    }

    if (!ID_PATTERN.test(p.id)) {
      return json({ ok: false, error: 'Invalid map ID' }, callback);
    }

    const map = readMap_(p.id);
    if (!map) return json({ ok: false, error: 'Map not found' }, callback);
    return json({ ok: true, map: map }, callback);
  } catch (err) {
    return json({ ok: false, error: safeError_(err) }, callback);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const configuredKey = PropertiesService.getScriptProperties().getProperty('WRITE_KEY');

    if (!configuredKey || body.key !== configuredKey) {
      return json({ ok: false, error: 'Unauthorized' });
    }

    if (body.action === 'save') return json(saveMap_(body.map));
    if (body.action === 'delete') return json(deleteMap_(body.id));
    if (body.action === 'list') return json(listMaps_());

    return json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json({ ok: false, error: safeError_(err) });
  }
}

function routeRequest_(p) {
  const id = String(p.id || '');
  const poiIndex = Number(p.poi);
  const reversed = String(p.reverse || '0') === '1';
  const requestedMode = String(p.mode || 'DRIVING').toUpperCase();
  const travelMode = ROUTE_MODE_ALLOWLIST[requestedMode];

  if (!ID_PATTERN.test(id)) return { ok: false, error: 'Invalid map ID' };
  if (!Number.isInteger(poiIndex) || poiIndex < 0) return { ok: false, error: 'Invalid POI' };
  if (!travelMode) return { ok: false, error: 'Travel mode is not available yet' };

  const map = readMap_(id);
  if (!map || !map.home || !Array.isArray(map.pois)) return { ok: false, error: 'Map not found' };
  if (poiIndex >= map.pois.length) return { ok: false, error: 'Invalid POI' };

  const home = waypoint_(map.home, true);
  const poi = waypoint_(map.pois[poiIndex], false);
  if (!home || !poi) return { ok: false, error: 'Route endpoints are incomplete' };

  const apiKey = PropertiesService.getScriptProperties().getProperty('ROUTES_API_KEY');
  if (!apiKey) return { ok: false, error: 'Route service is not configured' };

  const usage = reserveRouteRequest_();
  if (!usage.allowed) {
    return {
      ok: false,
      error: 'Daily route limit reached. Please try again tomorrow.',
      routeLimit: ROUTE_DAILY_LIMIT,
      routeUsed: usage.used
    };
  }

  const payload = {
    origin: reversed ? poi : home,
    destination: reversed ? home : poi,
    travelMode: travelMode,
    computeAlternativeRoutes: false,
    polylineQuality: 'OVERVIEW'
  };

  // Explicitly traffic-unaware. Do not change this without reviewing Google pricing first.
  if (travelMode === 'DRIVE') payload.routingPreference = 'TRAFFIC_UNAWARE';

  const response = UrlFetchApp.fetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  const status = response.getResponseCode();
  const text = response.getContentText();
  let parsed = {};
  try { parsed = JSON.parse(text || '{}'); } catch (_) {}

  if (status < 200 || status >= 300) {
    const message = parsed && parsed.error && parsed.error.message
      ? parsed.error.message
      : 'Google Routes request failed';
    return {
      ok: false,
      error: message,
      routeLimit: ROUTE_DAILY_LIMIT,
      routeUsed: usage.used
    };
  }

  const route = parsed.routes && parsed.routes[0];
  if (!route || !route.polyline || !route.polyline.encodedPolyline) {
    return {
      ok: false,
      error: 'No route found',
      routeLimit: ROUTE_DAILY_LIMIT,
      routeUsed: usage.used
    };
  }

  return {
    ok: true,
    route: {
      encodedPolyline: route.polyline.encodedPolyline,
      distanceMeters: Number(route.distanceMeters || 0),
      durationSeconds: durationSeconds_(route.duration)
    },
    routeLimit: ROUTE_DAILY_LIMIT,
    routeUsed: usage.used,
    routeRemaining: Math.max(0, ROUTE_DAILY_LIMIT - usage.used)
  };
}

function waypoint_(item, isHome) {
  if (!item) return null;

  const placeId = isHome
    ? (item.googlePlaceId || item.placeId)
    : (item.placeId || item.googlePlaceId);

  if (placeId) return { placeId: String(placeId) };

  const lat = Number(item.lat);
  const lng = Number(item.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      location: {
        latLng: {
          latitude: lat,
          longitude: lng
        }
      }
    };
  }

  if (item.address) return { address: String(item.address) };
  return null;
}

function reserveRouteRequest_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const props = PropertiesService.getScriptProperties();
    const tz = Session.getScriptTimeZone() || 'Asia/Kuala_Lumpur';
    const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
    let state = {};

    try {
      state = JSON.parse(props.getProperty('ROUTE_USAGE_STATE') || '{}');
    } catch (_) {
      state = {};
    }

    let used = state.date === today ? Number(state.count || 0) : 0;
    if (used >= ROUTE_DAILY_LIMIT) return { allowed: false, used: used, date: today };

    used += 1;
    props.setProperty('ROUTE_USAGE_STATE', JSON.stringify({ date: today, count: used }));
    return { allowed: true, used: used, date: today };
  } finally {
    lock.releaseLock();
  }
}

function durationSeconds_(value) {
  if (typeof value === 'number') return value;
  const match = String(value || '').match(/^([0-9]+(?:\.[0-9]+)?)s$/);
  return match ? Math.round(Number(match[1])) : 0;
}

function readMap_(id) {
  const file = findMapFile_(id);
  if (!file) return null;
  return JSON.parse(file.getBlob().getDataAsString('UTF-8'));
}

function saveMap_(map) {
  if (!map || !ID_PATTERN.test(map.id || '')) return { ok: false, error: 'Invalid map ID' };
  if (!map.home || !Array.isArray(map.pois)) return { ok: false, error: 'Invalid map data' };

  const folder = DriveApp.getFolderById(FOLDER_ID);
  const name = map.id + '.json';
  const text = JSON.stringify(map, null, 2);
  const files = folder.getFilesByName(name);

  if (files.hasNext()) {
    const file = files.next();
    file.setContent(text);
    while (files.hasNext()) files.next().setTrashed(true);
  } else {
    folder.createFile(name, text, MimeType.PLAIN_TEXT);
  }

  return { ok: true, id: map.id };
}

function deleteMap_(id) {
  if (!ID_PATTERN.test(id || '')) return { ok: false, error: 'Invalid map ID' };
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFilesByName(id + '.json');
  let deleted = 0;
  while (files.hasNext()) {
    files.next().setTrashed(true);
    deleted++;
  }
  return { ok: true, id: id, deleted: deleted };
}

function listMaps_() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();
  const maps = [];

  while (files.hasNext()) {
    const file = files.next();
    const match = file.getName().match(/^(psm_[A-Z2-9]{8})\.json$/);
    if (!match) continue;

    try {
      const map = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
      maps.push({
        id: match[1],
        title: map.title || '',
        client: map.client || '',
        homeName: map.home && map.home.name ? map.home.name : '',
        poiCount: Array.isArray(map.pois) ? map.pois.length : 0,
        updatedAt: map.publishedAt || file.getLastUpdated().toISOString()
      });
    } catch (_) {}
  }

  maps.sort(function(a, b) {
    return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
  });

  return { ok: true, maps: maps };
}

function findMapFile_(id) {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFilesByName(id + '.json');
  return files.hasNext() ? files.next() : null;
}

function json(value, callback) {
  const text = JSON.stringify(value);
  const safeCallback = /^[A-Za-z_$][0-9A-Za-z_$]*(?:\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback || '')
    ? callback
    : '';

  if (safeCallback) {
    return ContentService
      .createTextOutput(safeCallback + '(' + text + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(text)
    .setMimeType(ContentService.MimeType.JSON);
}

function safeError_(err) {
  return err && err.message ? String(err.message) : 'Unexpected server error';
}
