import { z } from "zod";
import type { AgentContext } from "../security";
import { scopeAgency, scopeOwned } from "../security";
export const limitSchema = z.number().int().min(1).max(50).optional();
export const uuidSchema = z.string().uuid();
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) &&
      new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s,
    "Data inválida",
  );
export const CLIENT_COLUMNS =
  "id,full_name,status,purpose,property_type,neighborhood,assigned_broker_name,next_step,next_follow_up_at,brand,min_budget,max_budget,bedrooms";
export const ATTENDANCE_COLUMNS =
  "id,cliente_nome,status,pipeline_stage,finalidade,imobiliaria,corretor_nome,imovel_codigo,proximo_passo,proximo_retorno,created_at,updated_at";
export const PROPERTY_COLUMNS =
  "id,codigo,codigo_cordial,codigo_morar,tipo,finalidade,bairro,cidade,valor,dormitorios,corretor_nome,disponibilidade,exibir_imovel";
export function clientQuery(ctx: AgentContext): any {
  return scopeOwned(
    scopeAgency(ctx.supabase.from("clients").select(CLIENT_COLUMNS), ctx, "brand"),
    ctx,
    "assigned_broker_id",
  );
}
export function attendanceQuery(ctx: AgentContext, columns = ATTENDANCE_COLUMNS): any {
  return scopeOwned(
    scopeAgency(ctx.supabase.from("attendances").select(columns), ctx, "imobiliaria"),
    ctx,
    "corretor_id",
  );
}
export async function rows(query: any, ctx: AgentContext): Promise<any[]> {
  ctx.signal?.throwIfAborted();
  if (ctx.signal && typeof query.abortSignal === "function") query = query.abortSignal(ctx.signal);
  const { data, error } = await query;
  ctx.signal?.throwIfAborted();
  if (error) throw new Error("Não foi possível consultar os dados permitidos. Tente novamente.");
  return data ?? [];
}
export const safeLike = (value: string): string => value.replace(/[%,()*_\\]/g, " ").trim();
export function clientRecord(c: any) {
  return {
    id: c.id,
    nome: c.full_name,
    status: c.status,
    finalidade: c.purpose,
    tipoImovel: c.property_type,
    bairro: c.neighborhood,
    corretor: c.assigned_broker_name,
    proximoPasso: c.next_step,
    proximoRetorno: c.next_follow_up_at,
    marca: c.brand,
    href: `/clientes/${c.id}`,
  };
}
export function attendanceRecord(a: any) {
  return {
    id: a.id,
    cliente: a.cliente_nome,
    status: a.status,
    etapa: a.pipeline_stage,
    finalidade: a.finalidade,
    imobiliaria: a.imobiliaria,
    corretor: a.corretor_nome,
    imovelCodigo: a.imovel_codigo,
    proximoPasso: a.proximo_passo,
    proximoRetorno: a.proximo_retorno,
    criadoEm: a.created_at,
    href: `/atendimentos?id=${a.id}`,
  };
}
export function propertyRecord(p: any) {
  return {
    id: p.id,
    codigo: p.codigo,
    codigoCordial: p.codigo_cordial,
    codigoMorar: p.codigo_morar,
    tipo: p.tipo,
    finalidade: p.finalidade,
    bairro: p.bairro,
    cidade: p.cidade,
    valor: p.valor === null ? null : Number(p.valor),
    dormitorios: p.dormitorios,
    corretor: p.corretor_nome,
    href: `/imoveis/${p.id}`,
  };
}
export function saoPauloDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function previousMonth(): string {
  const [year, month] = saoPauloDay().split("-").map(Number);
  return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}
export function groupBy(data: any[], key: string): Record<string, number> {
  const grouped: Record<string, number> = Object.create(null);
  for (const row of data) {
    const name = String(row[key] ?? "não informado");
    grouped[name] = (grouped[name] ?? 0) + 1;
  }
  return grouped;
}
export const OPEN_ATTENDANCE_STATUSES = [
  "novo",
  "aguardando_retorno",
  "em_atendimento",
  "visita_agendada",
  "proposta_enviada",
  "negociacao",
];
/** Only already-published raster URLs. Private storage and signed URLs never leave the server. */
export function safePublicCover(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 1000) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const allowed = [
      "cordialimoveis.com",
      "imobiliariamorarimoveis.com.br",
      "imobibrasil.com.br",
      "imobibrasil.net",
      "imobibrasil.com",
      "imobibrasil.app",
    ].some((h) => host === h || host.endsWith(`.${h}`));
    if (
      !allowed ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !/\.(jpe?g|png|webp|avif)$/i.test(url.pathname) ||
      /\/object\/(sign|authenticated)\//i.test(url.pathname)
    )
      return null;
    return url.toString();
  } catch {
    return null;
  }
}
export async function withPublicCovers<T extends { id: string }>(
  records: T[],
  ctx: AgentContext,
): Promise<Array<T & { photoUrl: string | null }>> {
  if (!records.length) return [];
  const ids = records.slice(0, 50).map((p) => p.id);
  const images = await rows(
    ctx.supabase
      .from("property_images")
      .select("id,property_id")
      .in("property_id", ids)
      .eq("position", 0)
      .limit(ids.length),
    ctx,
  );
  const published = images.length
    ? await rows(
        ctx.supabase
          .from("property_image_provider_publications")
          .select("image_id,remote_url")
          .in(
            "image_id",
            images.map((i) => i.id),
          )
          .eq("status", "synced")
          .eq("desired_state", "present")
          .is("deleted_at", null)
          .limit(images.length * 2),
        ctx,
      )
    : [];
  const urls = new Map<string, string>();
  for (const image of images) {
    const url = published
      .filter((p) => p.image_id === image.id)
      .map((p) => safePublicCover(p.remote_url))
      .find(Boolean);
    if (url) urls.set(image.property_id, url);
  }
  return records.map((p) => ({ ...p, photoUrl: urls.get(p.id) ?? null }));
}
