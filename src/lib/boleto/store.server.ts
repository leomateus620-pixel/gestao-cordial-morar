/** Server-only Supabase implementation of the boleto store (service role, after authorization). */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import type { BoletoRow, BoletoStore } from "./flow.server";
import { formatCompetencia, type BillingAmbiente, type BoletoBrand, type Encargos, parseEncargos } from "./rules";
import { accountMasks, readSicrediCredentials } from "./sicredi/config.server";

const asRow = (r: unknown) => r as BoletoRow;

export function createBoletoStore(): BoletoStore {
  const db = supabaseAdmin;
  return {
    async prepare(a) {
      const { data, error } = await db.rpc("rental_boleto_prepare", {
        _contract_id: a.contractId,
        _account_id: a.accountId,
        _competencia: a.competencia,
        _snapshot: a.snapshot as unknown as Json,
        _total_centavos: a.totalCentavos,
        _vencimento: a.vencimento,
        _actor: a.actor,
      });
      if (error || !data?.[0]) {
        const msg = error?.message ?? "";
        if (msg.includes("production issuance disabled"))
          throw new Error("A emissão em produção desta conta não está liberada.");
        if (msg.includes("not configured")) throw new Error("Conta de cobrança não configurada.");
        if (msg.includes("brand mismatch")) throw new Error("A conta não corresponde à marca do contrato.");
        throw new Error("Não foi possível preparar o boleto.");
      }
      const r = data[0];
      return { id: r.out_id, estado: r.out_estado as BoletoRow["estado"], created: r.out_created };
    },
    async get(id) {
      const { data } = await db.from("rental_boletos").select("*").eq("id", id).maybeSingle();
      return data ? asRow(data) : null;
    },
    async transition(id, from, to, patch, actor, meta = {}) {
      const { data, error } = await db.rpc("rental_boleto_transition", {
        _id: id,
        _from: from,
        _to: to,
        _patch: patch as Json,
        _actor: actor,
        _http: meta.http ?? undefined,
        _mensagem: meta.mensagem,
        _detalhe: (meta.detalhe ?? {}) as Json,
      });
      if (error) throw new Error("Não foi possível atualizar o boleto.");
      const rows = (data ?? []) as unknown[];
      return rows[0] ? asRow(rows[0]) : null;
    },
    async uploadPdf(path, bytes) {
      const { error } = await db.storage
        .from("rental-documents")
        .upload(path, new Blob([bytes as BlobPart], { type: "application/pdf" }), {
          contentType: "application/pdf",
          upsert: true,
        });
      if (error) throw new Error("Não foi possível guardar o PDF do boleto.");
    },
    async recordEmission(row, actor) {
      const fileName = `Boleto - ${row.brand === "morar" ? "Morar" : "Cordial"} - ${formatCompetencia(row.competencia).replace("/", "-")}.pdf`;
      if (row.emission_id) {
        await db
          .from("rental_emissions")
          .update({ file_path: row.pdf_path, file_name: row.pdf_path ? fileName : null })
          .eq("id", row.emission_id)
          .eq("tipo", "boleto");
        return row.emission_id;
      }
      const { data, error } = await db
        .from("rental_emissions")
        .insert({
          contract_id: row.contract_id,
          tipo: "boleto",
          competencia: row.competencia,
          status: "emitido",
          numero: row.nosso_numero,
          copy_value: row.linha_digitavel,
          file_path: row.pdf_path,
          file_name: row.pdf_path ? fileName : null,
          provider: "sicredi",
          valores: { boletoId: row.id, totalCentavos: row.total_centavos, vencimento: row.vencimento } as Json,
          created_by: actor,
        })
        .select("id")
        .single();
      if (error || !data) return null;
      return data.id;
    },
    async findByNossoNumero(accountId, nossos) {
      const { data } = await db
        .from("rental_boletos")
        .select("*")
        .eq("account_id", accountId)
        .in("nosso_numero", nossos.slice(0, 500));
      return (data ?? []).map(asRow);
    },
  };
}

export type BillingAccountRow = {
  id: string;
  brand: BoletoBrand;
  ambiente: BillingAmbiente;
  apelido: string;
  beneficiario_mascara: string | null;
  cooperativa_mascara: string | null;
  posto_mascara: string | null;
  configurado: boolean;
  autenticado_em: string | null;
  consulta_ok_em: string | null;
  ultimo_teste_em: string | null;
  ultimo_teste_ok: boolean | null;
  ultimo_teste_mensagem: string | null;
  emissao_habilitada: boolean;
  liberado_por: string | null;
  liberado_em: string | null;
  encargos: Encargos;
  updated_at: string;
};

/** Ensures the account row exists and mirrors whether its secrets are present (names only). */
export async function ensureBillingAccount(brand: BoletoBrand, ambiente: BillingAmbiente): Promise<BillingAccountRow> {
  const configurado = readSicrediCredentials(brand, ambiente).ok;
  const { data: existing } = await supabaseAdmin
    .from("billing_accounts")
    .select("*")
    .eq("brand", brand)
    .eq("ambiente", ambiente)
    .maybeSingle();
  if (existing) {
    const row = existing as unknown as BillingAccountRow;
    if (row.configurado !== configurado) {
      const patch: Record<string, unknown> = { configurado, ...accountMasks(ambiente) };
      // Losing a secret always switches production issuance off.
      if (!configurado) Object.assign(patch, { emissao_habilitada: false });
      const { data: upd } = await supabaseAdmin
        .from("billing_accounts")
        .update(patch as never)
        .eq("id", row.id)
        .select("*")
        .single();
      return normalizeAccount(upd ?? existing);
    }
    return normalizeAccount(existing);
  }
  const { data, error } = await supabaseAdmin
    .from("billing_accounts")
    .upsert(
      {
        brand,
        ambiente,
        configurado,
        apelido: `${brand === "morar" ? "Morar" : "Cordial"} · ${ambiente === "sandbox" ? "Homologação" : "Produção"}`,
        ...accountMasks(ambiente),
      },
      { onConflict: "brand,ambiente" },
    )
    .select("*")
    .single();
  if (error || !data) throw new Error("Não foi possível preparar a conta de cobrança.");
  return normalizeAccount(data);
}
function normalizeAccount(raw: unknown): BillingAccountRow {
  const r = raw as BillingAccountRow;
  let encargos: Encargos;
  try {
    encargos = parseEncargos(r.encargos);
  } catch {
    encargos = { ativo: false };
  }
  return { ...r, encargos };
}
export async function updateBillingAccount(id: string, patch: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from("billing_accounts")
    .update(patch as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error("Não foi possível atualizar a conta de cobrança.");
  return normalizeAccount(data);
}
export async function billingAccountEvent(
  accountId: string,
  tipo: "teste_conexao" | "salvar" | "liberar" | "desligar" | "liberacao_recusada",
  ok: boolean,
  actor: string,
  mensagem: string,
  detalhe: Record<string, unknown> = {},
) {
  await supabaseAdmin.from("billing_account_events").insert({
    account_id: accountId,
    tipo,
    ok,
    actor,
    mensagem: mensagem.slice(0, 400),
    detalhe: detalhe as Json,
  });
}
