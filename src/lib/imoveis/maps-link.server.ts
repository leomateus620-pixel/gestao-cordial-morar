import { extractMapsCoords, formatCoords, isShortMapsUrl } from "./maps-link";

/**
 * Resolve o link do Maps em coordenada. O link curto do app é apenas um
 * redirecionamento: seguimos o redirect e lemos a URL final.
 * Falha de rede nunca bloqueia o salvamento — devolvemos null.
 */
export async function resolveMapsCoords(raw: string | null | undefined): Promise<string | null> {
  const value = (raw ?? "").trim();
  if (!value) return null;

  const direct = extractMapsCoords(value);
  if (direct) return formatCoords(direct);
  if (!isShortMapsUrl(value)) return null;

  try {
    const response = await fetch(value, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; GestaoCordial/1.0)" },
    });
    const expanded = extractMapsCoords(response.url);
    if (expanded) return formatCoords(expanded);
    const body = await response.text();
    const inBody = extractMapsCoords(body.slice(0, 200_000));
    return inBody ? formatCoords(inBody) : null;
  } catch {
    return null;
  }
}
