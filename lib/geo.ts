// Utilidades de ubicación (sin dependencias: se usan en el servidor y en el navegador).

// Distancia en metros entre dos puntos (fórmula de haversine).
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Acepta "4.6097, -74.0817" (como se copia de Google Maps) o un enlace de
// Google Maps que tenga las coordenadas (…@4.6097,-74.0817,17z o ?q=4.6,-74.0).
export function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = /(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/.exec(String(text || ""));
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// Margen extra por la imprecisión del GPS del celular (máximo 100 m).
export function gpsSlack(accuracy: number | null | undefined) {
  return Math.min(Math.max(Number(accuracy) || 0, 0), 100);
}
