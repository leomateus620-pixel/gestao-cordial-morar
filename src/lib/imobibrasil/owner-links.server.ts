/**
 * Atualiza, a partir dos sites, os códigos de proprietário / corretor /
 * usuário adicional guardados em cada anúncio (22/09/2026, após a ImobiBrasil
 * restaurar os vínculos).
 *
 * Regras:
 * - Só leitura nos sites (listas paginadas de ativos e inativos + dados da pessoa).
 * - Código zero/vazio lido no site NUNCA apaga um código já guardado.
 * - Contato do proprietário só preenche campo VAZIO da ficha; valor diferente
 *   é devolvido como divergência, nunca sobrescrito.
 * - Nenhum vínculo é escolhido pelo nome.
 */
import type { ImobiProvider } from "./providers";

type Admin = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const code = (value: unknown) => {
  const raw = String(value ?? "").trim();
  return raw && raw !== "0" ? raw : null;
};

export type OwnerLinksReport = {
  provider: ImobiProvider;
  leituraCompleta: boolean;
  lidosNoSite: number;
  comProprietarioNoSite: number;
  semProprietarioNoSite: string[];
  anunciosAtualizados: number;
  contatosPreenchidos: number;
  contatosPendentes: number;
  divergenciasContato: Array<{ codigoImovel: string; campo: string; gestao: string; site: string }>;
};

function firstFilled(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

/** Espera a vez da conta (limite compartilhado com os workers) antes de desistir. */
async function readPersonPatiently<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      const category = (error as { category?: string })?.category;
      if (category !== "rate_limit" || attempt >= 40) throw error;
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }
}

export async function refreshOwnerLinks(
  admin: Admin,
  provider: ImobiProvider,
  options: { contactBatch?: number; correlationId?: string; skipList?: boolean } = {},
): Promise<OwnerLinksReport> {
  const { fetchAllPropertyPages, fetchPersonDetail } = await import("./read.server");
  // skipList: usa só os códigos já guardados (para completar contatos em lotes).
  const list = options.skipList
    ? { reliable: false, items: [] as unknown[] }
    : await fetchAllPropertyPages(provider, {
        status: "ativos_e_inativos",
        ...(options.correlationId ? { correlationId: options.correlationId } : {}),
      });

  const remote = new Map<string, { p: string | null; c: string | null; u: string | null }>();
  for (const item of list.items as Array<Record<string, unknown>>) {
    const id = code(item["codigoImovel"]);
    if (!id) continue;
    remote.set(id, {
      p: code(item["codigoProprietario"]),
      c: code(item["codigoCorretor"]),
      u: code(item["codigoUsuarioAdicional"]),
    });
  }

  const { data: pubs, error } = await admin
    .from("property_provider_publications")
    .select(
      "id, property_id, external_property_id, remote_codigo_proprietario, remote_codigo_corretor, remote_codigo_usuario_adicional, properties(proprietario_nome, proprietario_telefone, proprietario_email)",
    )
    .eq("provider", provider)
    .not("external_property_id", "is", null);
  if (error) throw new Error(error.message);

  let updated = 0;
  const ownerByProperty: Array<{ pub: Record<string, any>; owner: string }> = []; // eslint-disable-line @typescript-eslint/no-explicit-any
  for (const pub of (pubs ?? []) as Array<Record<string, any>>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const r = remote.get(String(pub["external_property_id"])) ?? { p: null, c: null, u: null };
    const next = {
      remote_codigo_proprietario: r.p ?? pub["remote_codigo_proprietario"] ?? null,
      remote_codigo_corretor: r.c ?? pub["remote_codigo_corretor"] ?? null,
      remote_codigo_usuario_adicional: r.u ?? pub["remote_codigo_usuario_adicional"] ?? null,
    };
    const changed =
      String(next.remote_codigo_proprietario ?? "") !== String(pub["remote_codigo_proprietario"] ?? "") ||
      String(next.remote_codigo_corretor ?? "") !== String(pub["remote_codigo_corretor"] ?? "") ||
      String(next.remote_codigo_usuario_adicional ?? "") !== String(pub["remote_codigo_usuario_adicional"] ?? "");
    if (changed) {
      const { error: upErr } = await admin
        .from("property_provider_publications")
        .update({ ...next, remote_links_synced_at: new Date().toISOString() })
        .eq("id", pub["id"]);
      if (upErr) throw new Error(upErr.message);
      updated++;
    }
    if (next.remote_codigo_proprietario) ownerByProperty.push({ pub, owner: String(next.remote_codigo_proprietario) });
  }

  // Contato: só quando falta nome ou algum meio de contato na ficha; lote limitado por chamada.
  const needContact = ownerByProperty.filter(({ pub }) => {
    const prop = pub["properties"] ?? {};
    const vazio = (k: string) => !String(prop[k] ?? "").trim();
    // Sem nome, ou sem nenhum meio de contato. (Quem já tem nome e e-mail não é relido.)
    return vazio("proprietario_nome") || (vazio("proprietario_telefone") && vazio("proprietario_email"));
  });
  const batch = needContact.slice(0, options.contactBatch ?? 20);
  let filled = 0;
  const divergencias: OwnerLinksReport["divergenciasContato"] = [];
  const personCache = new Map<string, Record<string, unknown>>();
  for (const { pub, owner } of batch) {
    try {
      let person = personCache.get(owner);
      if (!person) {
        person = await readPersonPatiently(() => fetchPersonDetail(provider, owner, options.correlationId));
        personCache.set(owner, person);
      }
      const site = {
        // A API devolve o nome em "nomeResponsavel" (pessoa física) ou razão social/fantasia.
        proprietario_nome: firstFilled(person, ["nomeResponsavel", "nome", "razaoSocial", "nomeFantasia"]),
        proprietario_telefone: firstFilled(person, ["telefone1", "telefone2", "telefone3"]),
        proprietario_email: firstFilled(person, ["email", "email1", "email2"]),
      };
      const prop = pub["properties"] ?? {};
      const patch: Record<string, string> = {};
      for (const [campo, valorSite] of Object.entries(site)) {
        const atual = String(prop[campo] ?? "").trim();
        if (!valorSite) continue;
        if (!atual) patch[campo] = valorSite;
        else if (atual.toLowerCase() !== valorSite.toLowerCase())
          divergencias.push({ codigoImovel: String(pub["external_property_id"]), campo, gestao: atual, site: valorSite });
      }
      if (Object.keys(patch).length) {
        const { error: pErr } = await admin.from("properties").update(patch).eq("id", pub["property_id"]);
        if (pErr) throw new Error(pErr.message);
        Object.assign(prop, patch);
        filled++;
      }
    } catch {
      // Falha de leitura da pessoa: fica pendente para a próxima execução.
    }
  }

  const semProprietario = [...remote.entries()].filter(([, r]) => !r.p).map(([id]) => id);
  return {
    provider,
    leituraCompleta: list.reliable,
    lidosNoSite: remote.size,
    comProprietarioNoSite: remote.size - semProprietario.length,
    semProprietarioNoSite: semProprietario,
    anunciosAtualizados: updated,
    contatosPreenchidos: filled,
    contatosPendentes: Math.max(0, needContact.length - batch.length),
    divergenciasContato: divergencias,
  };
}
