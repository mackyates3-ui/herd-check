import type { GeoFix, Sighting } from "../types";

const GEO_TIMEOUT_MS = 4500;

export function readGeo(): Promise<GeoFix | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: GeoFix | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = window.setTimeout(() => finish(null), GEO_TIMEOUT_MS);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        window.clearTimeout(timer);
        finish({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy:
            typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : null,
        });
      },
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 20_000 },
    );
  });
}

export function mapsUrl(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}

export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function formatAccuracy(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters >= 1000) return `±${(meters / 1000).toFixed(1)} km`;
  return `±${Math.round(meters)} m`;
}

export function relativePins(sightings: Sighting[]): {
  sighting: Sighting;
  x: number;
  y: number;
}[] {
  const located = sightings.filter(
    (s): s is Sighting & { lat: number; lng: number } =>
      s.lat != null && s.lng != null,
  );
  if (located.length === 0) return [];

  const lats = located.map((s) => s.lat);
  const lngs = located.map((s) => s.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = Math.max(maxLat - minLat, 8e-4);
  const lngSpan = Math.max(maxLng - minLng, 8e-4);

  return located.map((sighting) => ({
    sighting,
    x: 18 + ((sighting.lng - minLng) / lngSpan) * 284,
    y: 18 + ((maxLat - sighting.lat) / latSpan) * 114,
  }));
}
