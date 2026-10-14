/**
 * Monta a resposta pública da seleção a partir do retorno do banco usando uma
 * lista fechada de campos. Qualquer campo extra que chegue é descartado.
 */
export type PublicSelectionItem =
  | { available: false; key: number }
  | {
      available: true;
      key: number;
      reference: string | null;
      type: string | null;
      operation: string | null;
      price: number | null;
      condo: number | null;
      iptu: number | null;
      location: string | null;
      bedrooms: number | null;
      bathrooms: number | null;
      parking: number | null;
      area: number | null;
      photos: string[];
    };

export type PublicSelection =
  | { state: "invalid" }
  | { state: "closed" | "expired"; agency: "cordial" | "morar" }
  | { state: "rate_limited" }
  | {
      state: "ok";
      agency: "cordial" | "morar";
      title: string;
      message: string;
      broker: string;
      whatsapp: string;
      items: PublicSelectionItem[];
    };

/* eslint-disable @typescript-eslint/no-explicit-any */
const str = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const agencyOf = (v: any): "cordial" | "morar" => (v === "morar" ? "morar" : "cordial");

export function photoPathsOf(raw: any): string[] {
  if (!raw || raw.state !== "ok" || !Array.isArray(raw.items)) return [];
  return raw.items.flatMap((i: any) =>
    i?.available && Array.isArray(i.photos) ? i.photos.filter((p: any) => typeof p === "string") : [],
  );
}

export function toPublicSelection(raw: any, signed: Map<string, string>): PublicSelection {
  if (!raw || raw.state === "invalid" || typeof raw.state !== "string") return { state: "invalid" };
  if (raw.state === "closed" || raw.state === "expired") return { state: raw.state, agency: agencyOf(raw.agency) };
  if (raw.state !== "ok") return { state: "invalid" };
  const items: PublicSelectionItem[] = (Array.isArray(raw.items) ? raw.items : []).map(
    (i: any, idx: number): PublicSelectionItem => {
      const key = num(i?.key) ?? idx + 1;
      if (!i?.available) return { available: false, key };
      return {
        available: true,
        key,
        reference: str(i.reference),
        type: str(i.type),
        operation: i.operation === "aluguel" ? "aluguel" : i.operation === "venda" ? "venda" : null,
        price: num(i.price),
        condo: num(i.condo),
        iptu: num(i.iptu),
        location: str(i.location),
        bedrooms: num(i.bedrooms),
        bathrooms: num(i.bathrooms),
        parking: num(i.parking),
        area: num(i.area),
        photos: (Array.isArray(i.photos) ? i.photos : [])
          .map((p: any) => (typeof p === "string" ? signed.get(p) : undefined))
          .filter(Boolean) as string[],
      };
    },
  );
  return {
    state: "ok",
    agency: agencyOf(raw.agency),
    title: str(raw.title) ?? "Seleção de imóveis",
    message: typeof raw.message === "string" ? raw.message : "",
    broker: str(raw.broker) ?? "",
    whatsapp: typeof raw.whatsapp === "string" && /^\d{10,15}$/.test(raw.whatsapp) ? raw.whatsapp : "",
    items,
  };
}
