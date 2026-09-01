/**
 * Utilidades puras para o link de localização do Google Maps.
 * O link é interno: serve só para a equipe encontrar o imóvel no mapa.
 */

const ALLOWED_HOSTS = [
  "google.com",
  "www.google.com",
  "maps.google.com",
  "goo.gl",
  "maps.app.goo.gl",
  "www.google.com.br",
  "google.com.br",
  "maps.google.com.br",
];

export function isGoogleMapsUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (!ALLOWED_HOSTS.includes(host)) return false;
    if (host.endsWith("goo.gl")) return true;
    return url.pathname.startsWith("/maps") || url.searchParams.has("q");
  } catch {
    return false;
  }
}

/** Link curto do app: precisa ser expandido no servidor para virar coordenada. */
export function isShortMapsUrl(raw: string): boolean {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase();
    return host === "maps.app.goo.gl" || host === "goo.gl";
  } catch {
    return false;
  }
}

export type MapsCoords = { lat: number; lng: number };

function parsePair(lat: string, lng: string): MapsCoords | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { lat: latitude, lng: longitude };
}

/** Extrai coordenadas de um link longo do Maps (`@lat,lng`, `!3dlat!4dlng`, `q=lat,lng`). */
export function extractMapsCoords(raw: string): MapsCoords | null {
  const value = (raw ?? "").trim();
  if (!value) return null;

  const at = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (at?.[1] && at[2]) {
    const parsed = parsePair(at[1], at[2]);
    if (parsed) return parsed;
  }

  const bang = value.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bang?.[1] && bang[2]) {
    const parsed = parsePair(bang[1], bang[2]);
    if (parsed) return parsed;
  }

  try {
    const url = new URL(value);
    for (const key of ["q", "query", "ll", "center", "destination"]) {
      const param = url.searchParams.get(key);
      const pair = param?.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (pair?.[1] && pair[2]) {
        const parsed = parsePair(pair[1], pair[2]);
        if (parsed) return parsed;
      }
    }
  } catch {
    // link sem formato de URL: sem coordenadas
  }

  return null;
}

export function formatCoords(coords: MapsCoords): string {
  return `${coords.lat},${coords.lng}`;
}

export function parseCoords(stored: string | null | undefined): MapsCoords | null {
  if (!stored) return null;
  const parts = stored.split(",");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return parsePair(parts[0], parts[1]);
}

/** Iframe do Maps sem chave de API — só precisa da coordenada. */
export function mapsEmbedUrl(coords: MapsCoords, zoom = 16): string {
  return `https://www.google.com/maps?q=${coords.lat},${coords.lng}&z=${zoom}&hl=pt-BR&output=embed`;
}
