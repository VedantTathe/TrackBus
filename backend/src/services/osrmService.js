import { CITY_COORDINATES } from '../data/cityCoordinates.js';

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const NOMINATIM_BASE_URL = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const DEFAULT_REGION = 'Maharashtra, India';

const fetchJson = async (url) => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'trackbus-routing/1.0 (local)'
    }
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OSM service error ${res.status}: ${body.slice(0, 160)}`);
  }

  return res.json();
};

export const geocodeCity = async (name) => {
  const query = encodeURIComponent(`${name}, ${DEFAULT_REGION}`);
  const url = `${NOMINATIM_BASE_URL}/search?format=jsonv2&limit=1&q=${query}`;
  const json = await fetchJson(url);
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error(`Unable to geocode city: ${name}`);
  }

  const item = json[0];
  return {
    lat: Number(item.lat),
    lng: Number(item.lon),
    displayName: item.display_name || name
  };
};

export const fetchOsrmRoutes = async (sourceName, destinationName) => {
  const source = await geocodeCity(sourceName);
  const destination = await geocodeCity(destinationName);

  const coords = `${source.lng},${source.lat};${destination.lng},${destination.lat}`;
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coords}?alternatives=true&overview=full&geometries=geojson&steps=false`;
  const json = await fetchJson(url);

  if (!json || json.code !== 'Ok' || !Array.isArray(json.routes)) {
    throw new Error('Failed to fetch route alternatives from OSRM.');
  }

  return json.routes.map((route, index) => ({
    index,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: route.geometry,
    source,
    destination
  }));
};

export const fetchOsrmRouteThroughVia = async (sourceName, viaName, destinationName) => {
  const source = await geocodeCity(sourceName);
  
  // Resolve via coordinate locally from CITY_COORDINATES if present
  const localCoord = CITY_COORDINATES[viaName.toLowerCase()];
  let via;
  if (localCoord) {
    via = {
      lat: localCoord[0],
      lng: localCoord[1],
      displayName: viaName
    };
  } else {
    via = await geocodeCity(viaName);
  }
  
  const destination = await geocodeCity(destinationName);

  const coords = `${source.lng},${source.lat};${via.lng},${via.lat};${destination.lng},${destination.lat}`;
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coords}?alternatives=false&overview=full&geometries=geojson&steps=false`;
  const json = await fetchJson(url);

  if (!json || json.code !== 'Ok' || !Array.isArray(json.routes) || json.routes.length === 0) {
    throw new Error(`Failed to fetch route through ${viaName} from OSRM.`);
  }

  const route = json.routes[0];
  return {
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: route.geometry,
    source,
    destination
  };
};
