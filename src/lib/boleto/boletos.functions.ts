/**
 * Sicredi boleto server functions. Every bank call happens on the server; the brand always
 * comes from the contract on the server; issuance is admin/secretaria only (checked here).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { RecurringAdjustment } from "@/lib/rentals/receipt-model";
import { testSicrediConnection } from "./connection.server";
import {
  applyLiquidadosDia,
  finishRegisteredBoleto,
  issuePreparedBoleto,
  reconcileUncertainBoleto,
  refreshRegisteredBoleto,
  type BoletoRow,
  type FlowDeps,
} from "./flow.server";
import { buildBoletoPreview, type BoletoPreview } from "./preview";
import {
  allowedIssuingBrands,
  boletoContractAccess,
  boletoPermissions,
  defaultIssuingBrand,
  resolveIssuingBrand,
  parseEncargos,
  todaySaoPaulo,
  type BillingAmbiente,
  type BoletoBrand,
  type BoletoEstado,
} from "./rules";
import { sicrediCobranca } from "./sicredi/cobranca.server";
import { readSicrediCredentials, sicrediSecretNames } from "./sicredi/config.server";
import {
  billingAccountEvent,
  createBoletoStore,
  ensureBillingAccount,
  updateBillingAccount,
  type BillingAccountRow,
} from "./store.server";

type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any
const brandSchema = z.enum(["cordial", "morar"]);
const ambienteSchema = z.enum(["sandbox", "producao"]);
const competenciaSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const isoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function roles(ctx: Ctx) {
  const ask = (role: string) =>
    ctx.supabase
      .rpc("has_role", { _user_id: ctx.userId, _role: role })
      .then((r: { data: unknown; error: unknown }) => !r.error && r.data === true);
  const [admin, secretaria, metaReviewer, atendimentosViewer] = await Promise.all([
    ask("admin"),
    ask("secretaria"),
    ask("meta_reviewer"),
    ask("atendimentos_viewer"),
  ]);
  const perms = boletoPermissions({
    admin,
    secretaria,
    metaReviewer: metaReviewer || atendimentosViewer,
  });
  return { ...perms, flags: { admin, secretaria, metaReviewer, atendimentosViewer } };
}

async function serviceDb() {
  // Loaded only after the caller's role was verified with their own session.
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/**
 * Role + brand gate for one contract. Contract data is read with the service client only
 * after this passes, always filtered by the authorized contract id (rental RLS stays closed).
 */
async function authorizeContract(ctx: Ctx, contractId: string) {
  const r = await roles(ctx);
  if (!r.podeEmitir)
    throw new Error("Apenas a administração ou a secretaria podem emitir e gerenciar boletos.");
  const db = await serviceDb();
  const [{ data: c }, { data: ag }] = await Promise.all([
    db.from("rental_contracts").select("id,brand").eq("id", contractId).maybeSingle(),
    db.from("user_agencies").select("agency").eq("user_id", ctx.userId),
  ]);
  if (!c) throw new Error("Aluguel indisponível.");
  const agencies = ((ag ?? []) as { agency: string }[]).map((a) => a.agency);
  if (!boletoContractAccess({ ...r.flags, agencies }, c.brand as string))
    throw new Error("Aluguel indisponível para o seu perfil.");
  return { db, roles: r, agencies, contractBrand: c.brand as string };
}
async function assertOperator(ctx: Ctx) {
  const r = await roles(ctx);
  if (!r.podeEmitir)
    throw new Error("Apenas a administração ou a secretaria podem emitir e gerenciar boletos.");
  return r;
}
async function assertAdmin(ctx: Ctx) {
  if (!(await roles(ctx)).podeGerenciarContas)
    throw new Error("Apenas o administrador pode gerenciar contas de cobrança.");
}

function flowDeps(row: Pick<BoletoRow, "brand" | "ambiente">, actor: string): FlowDeps {
  const cred = readSicrediCredentials(row.brand as BoletoBrand, row.ambiente);
  if (!cred.ok)
    throw new Error("A conta de cobrança deste boleto não está configurada no servidor.");
  return {
    store: createBoletoStore(),
    client: sicrediCobranca(cred.credentials),
    codigoBeneficiario: cred.credentials.codigoBeneficiario,
    actor,
  };
}

/** UI projection: sandbox lines are hidden so a demo title can never be copied to a tenant. */
function publicBoleto(r: BoletoRow) {
  const ev = (r.liquidacao_evidencia ?? null) as {
    dataPagamento?: string | null;
    valorLiquidado?: number | null;
  } | null;
  return {
    id: r.id,
    competencia: r.competencia,
    ocorrencia: r.ocorrencia,
    ambiente: r.ambiente,
    estado: r.estado,
    pdfEstado: r.pdf_estado,
    totalCentavos: Number(r.total_centavos),
    vencimento: r.vencimento,
    vencimentoAlterado: Boolean(r.snapshot?.vencimento?.alterado),
    nossoNumero: r.nosso_numero,
    linhaDigitavel: r.ambiente === "producao" ? r.linha_digitavel : null,
    situacaoBanco: r.situacao_banco,
    ultimoErro: r.ultimo_erro,
    liquidacao: ev
      ? { dataPagamento: ev.dataPagamento ?? null, valorLiquidado: ev.valorLiquidado ?? null }
      : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
export type PublicBoleto = ReturnType<typeof publicBoleto>;

async function pickIssuingAccount(brand: BoletoBrand): Promise<BillingAccountRow | null> {
  const prod = await ensureBillingAccount(brand, "producao");
  if (prod.configurado && prod.emissao_habilitada && prod.consulta_ok_em) return prod;
  const sandbox = await ensureBillingAccount(brand, "sandbox");
  return sandbox.configurado ? sandbox : null;
}

async function computePreview(
  ctx: Ctx,
  contractId: string,
  competencia: string,
  novoVencimento: string | null,
  issuingBrand: string | null = null,
) {
  const { db: sb, roles: rr, agencies } = await authorizeContract(ctx, contractId);
  const { data: c } = await sb
    .from("rental_contracts")
    .select(
      "id,brand,status,dia_vencimento,proximo_vencimento,valor_mensal,seguro_valor_mensal,tenant_id,property_id",
    )
    .eq("id", contractId)
    .maybeSingle();
  if (!c) throw new Error("Aluguel indisponível.");
  const [tenant, property, receipt, recurring] = await Promise.all([
    sb
      .from("rental_tenants")
      .select("nome,cpf_cnpj,email,telefone")
      .eq("id", c.tenant_id)
      .maybeSingle(),
    sb
      .from("rental_properties")
      .select("logradouro,numero,complemento,bairro,cidade,uf,cep")
      .eq("id", c.property_id)
      .maybeSingle(),
    sb
      .from("rental_emissions")
      .select("valores")
      .eq("contract_id", contractId)
      .eq("competencia", competencia)
      .eq("tipo", "recibo")
      .eq("status", "emitido")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("rental_contract_adjustments")
      .select(
        "id,tipo,descricao,valor,repassar_proprietario,inicio_competencia,fim_competencia,ativo",
      )
      .eq("contract_id", contractId)
      .eq("ativo", true),
  ]);
  if (recurring.error || receipt.error)
    throw new Error("Não foi possível carregar os valores do aluguel.");
  const issuerFlags = { admin: rr.flags.admin, agencies };
  const resolved = resolveIssuingBrand(issuerFlags, c.brand, issuingBrand);
  const brand = resolved.ok ? resolved.brand : null;
  const account = brand ? await pickIssuingAccount(brand) : null;
  const marcasPermitidas = allowedIssuingBrands(issuerFlags, c.brand);
  const marcaSugerida = defaultIssuingBrand(issuerFlags, c.brand);
  const t = (tenant.data ?? {}) as Record<string, string | null>;
  const p = (property.data ?? {}) as Record<string, string | null>;
  const preview = buildBoletoPreview({
    contract: {
      id: c.id,
      brand: c.brand,
      status: c.status,
      diaVencimento: c.dia_vencimento,
      proximoVencimento: c.proximo_vencimento,
      valorMensal: Number(c.valor_mensal),
      seguroValorMensal: c.seguro_valor_mensal == null ? null : Number(c.seguro_valor_mensal),
    },
    pagador: { nome: t.nome, documento: t.cpf_cnpj, email: t.email, telefone: t.telefone, ...p },
    tenantId: c.tenant_id ?? null,
    competencia,
    today: todaySaoPaulo(),
    novoVencimento,
    receiptValores: receipt.data?.valores,
    recurring: (recurring.data ?? []).map(
      (r: Record<string, unknown>): RecurringAdjustment => ({
        id: String(r.id),
        tipo: r.tipo === "acrescimo" ? "acrescimo" : "desconto",
        descricao: String(r.descricao),
        valor: Number(r.valor),
        repassarProprietario: Boolean(r.repassar_proprietario),
        inicioCompetencia: String(r.inicio_competencia),
        fimCompetencia: (r.fim_competencia as string | null) ?? null,
        ativo: Boolean(r.ativo),
      }),
    ),
    account: account ? { ambiente: account.ambiente, encargos: account.encargos } : null,
    issuingBrand: brand,
    issuingBrandMotivo: resolved.ok ? null : resolved.motivo,
  });
  return { preview, account, marcasPermitidas, marcaSugerida };
}
function publicPreview(
  p: BoletoPreview,
  extra: { marcasPermitidas: BoletoBrand[]; marcaSugerida: BoletoBrand | null },
) {
  const { snapshot: _s, ...rest } = p;
  return { ...rest, ...extra };
}

const scope = z.object({ contractId: z.string().uuid(), competencia: competenciaSchema });

export const listRentalBoletos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof scope>) => scope.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const r0 = await roles(ctx);
    if (!r0.podeEmitir) return { boletos: [], podeEmitir: false };
    const { db } = await authorizeContract(ctx, data.contractId);
    const { data: rows, error } = await db
      .from("rental_boletos")
      .select("*")
      .eq("contract_id", data.contractId)
      .eq("competencia", data.competencia)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível carregar os boletos.");
    return {
      boletos: ((rows ?? []) as unknown as BoletoRow[]).map(publicBoleto),
      podeEmitir: true,
    };
  });

const previewInput = scope.extend({
  novoVencimento: isoSchema.nullable().optional(),
  issuingBrand: brandSchema.nullable().optional(),
});
export const previewBoleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof previewInput>) => previewInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOperator(ctx);
    const { preview, marcasPermitidas, marcaSugerida } = await computePreview(
      ctx,
      data.contractId,
      data.competencia,
      data.novoVencimento ?? null,
      data.issuingBrand ?? null,
    );
    return publicPreview(preview, { marcasPermitidas, marcaSugerida });
  });

const issueInput = previewInput.extend({
  expectedTotalCentavos: z.number().int().positive(),
  expectedAmbiente: ambienteSchema,
  expectedMarcaConta: brandSchema.optional(),
});
export const issueBoleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof issueInput>) => issueInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOperator(ctx);
    const { preview, account } = await computePreview(
      ctx,
      data.contractId,
      data.competencia,
      data.novoVencimento ?? null,
      data.issuingBrand ?? null,
    );
    if (!preview.ok || !preview.snapshot || !account)
      throw new Error(
        preview.bloqueios[0] ?? preview.pendencias.map((p) => `${p.campo} (${p.tela})`).join(", "),
      );
    if (
      preview.totalCentavos !== data.expectedTotalCentavos ||
      preview.ambiente !== data.expectedAmbiente ||
      (data.expectedMarcaConta && preview.marcaConta !== data.expectedMarcaConta)
    )
      throw new Error(
        "Os valores ou o ambiente mudaram desde a prévia. Revise e confirme de novo.",
      );
    const out = await issuePreparedBoleto(flowDeps(account, ctx.userId), {
      contractId: data.contractId,
      accountId: account.id,
      snapshot: preview.snapshot,
    });
    return {
      boleto: publicBoleto(out.row),
      enviado: out.enviado,
      reaproveitado: out.reaproveitado,
    };
  });

async function readableBoleto(ctx: Ctx, id: string): Promise<BoletoRow> {
  const row = await createBoletoStore().get(id);
  if (!row) throw new Error("Boleto indisponível.");
  await authorizeContract(ctx, row.contract_id);
  return row;
}
const idInput = z.object({ id: z.string().uuid() });

export const refreshBoleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof idInput>) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOperator(ctx);
    const row = await readableBoleto(ctx, data.id);
    const out = await refreshRegisteredBoleto(flowDeps(row, ctx.userId), row);
    return { boleto: publicBoleto(out.row), mensagem: out.mensagem };
  });

export const retryBoletoPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof idInput>) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOperator(ctx);
    const row = await readableBoleto(ctx, data.id);
    if (
      !row.linha_digitavel ||
      !["registrado", "baixa_solicitada", "liquidado"].includes(row.estado)
    )
      throw new Error("O PDF só existe para boletos registrados.");
    const out = await finishRegisteredBoleto(flowDeps(row, ctx.userId), {
      ...row,
      pdf_estado: row.pdf_estado === "pronto" ? "erro" : row.pdf_estado,
    });
    return { boleto: publicBoleto(out) };
  });

const reconcileInput = idInput.extend({ liberarMotivo: z.string().max(200).nullable().optional() });
export const reconcileBoleto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof reconcileInput>) => reconcileInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertOperator(ctx);
    const row = await readableBoleto(ctx, data.id);
    const out = await reconcileUncertainBoleto(flowDeps(row, ctx.userId), row, {
      liberarMotivo: data.liberarMotivo,
    });
    return { boleto: publicBoleto(out.row), mensagem: out.mensagem };
  });

export const getBoletoPdfUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof idInput>) => idInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const row = await readableBoleto(ctx, data.id);
    const db = await serviceDb();
    if (!row?.pdf_path || row.pdf_estado !== "pronto")
      throw new Error("PDF do boleto indisponível.");
    if (!row.pdf_path.startsWith(`${row.contract_id}/boletos/`) || row.pdf_path.includes(".."))
      throw new Error("PDF do boleto indisponível.");
    const { data: signed, error } = await db.storage
      .from("rental-documents")
      .createSignedUrl(row.pdf_path, 600);
    if (error || !signed) throw new Error("Não foi possível abrir o PDF do boleto.");
    return signed.signedUrl as string;
  });

// ============================ Accounts (admin) ============================
function publicAccount(a: BillingAccountRow) {
  return {
    brand: a.brand,
    ambiente: a.ambiente,
    apelido: a.apelido,
    beneficiario: a.beneficiario_mascara,
    cooperativa: a.cooperativa_mascara,
    posto: a.posto_mascara,
    configurado: a.configurado,
    segredosNecessarios: a.configurado ? [] : sicrediSecretNames(a.brand, a.ambiente),
    autenticadoEm: a.autenticado_em,
    consultaOkEm: a.consulta_ok_em,
    ultimoTesteEm: a.ultimo_teste_em,
    ultimoTesteOk: a.ultimo_teste_ok,
    ultimoTesteMensagem: a.ultimo_teste_mensagem,
    emissaoHabilitada: a.emissao_habilitada,
    liberadoEm: a.liberado_em,
    encargos: a.encargos,
  };
}
export type PublicBillingAccount = ReturnType<typeof publicAccount>;

export const listBillingAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const out: PublicBillingAccount[] = [];
    for (const brand of ["cordial", "morar"] as const)
      for (const ambiente of ["sandbox", "producao"] as const)
        out.push(publicAccount(await ensureBillingAccount(brand, ambiente)));
    return out;
  });

const accountKey = z.object({ brand: brandSchema, ambiente: ambienteSchema });
export const testBillingConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof accountKey>) => accountKey.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const acc = await ensureBillingAccount(data.brand, data.ambiente);
    const cred = readSicrediCredentials(data.brand, data.ambiente);
    const now = new Date().toISOString();
    if (!cred.ok) {
      const names = [...cred.missing, ...cred.invalid];
      const mensagem = `Conta não configurada: ${cred.missing.length ? "faltam" : "formato inválido em"} ${names.join(", ")}.`;
      await updateBillingAccount(acc.id, {
        ultimo_teste_em: now,
        ultimo_teste_ok: false,
        ultimo_teste_mensagem: mensagem,
      });
      await billingAccountEvent(acc.id, "teste_conexao", false, ctx.userId, mensagem);
      return {
        tokenOk: false,
        consultaOk: false,
        mensagem,
        account: publicAccount(await ensureBillingAccount(data.brand, data.ambiente)),
      };
    }
    const r = await testSicrediConnection(cred.credentials);
    const patch: Record<string, unknown> = {
      ultimo_teste_em: now,
      ultimo_teste_ok: r.tokenOk && r.consultaOk,
      ultimo_teste_mensagem: r.mensagem.slice(0, 400),
    };
    if (r.tokenOk) patch.autenticado_em = now;
    if (r.tokenOk && r.consultaOk) patch.consulta_ok_em = now;
    const updated = await updateBillingAccount(acc.id, patch);
    await billingAccountEvent(
      acc.id,
      "teste_conexao",
      r.tokenOk && r.consultaOk,
      ctx.userId,
      r.mensagem,
      {
        tokenOk: r.tokenOk,
        consultaOk: r.consultaOk,
        status: r.status,
      },
    );
    return {
      tokenOk: r.tokenOk,
      consultaOk: r.consultaOk,
      mensagem: r.mensagem,
      account: publicAccount(updated),
    };
  });

const saveInput = accountKey.extend({ apelido: z.string().trim().max(80), encargos: z.unknown() });
export const saveBillingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof saveInput>) => saveInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const encargos = parseEncargos(data.encargos);
    const acc = await ensureBillingAccount(data.brand, data.ambiente);
    const updated = await updateBillingAccount(acc.id, { apelido: data.apelido, encargos });
    await billingAccountEvent(acc.id, "salvar", true, ctx.userId, "Conta atualizada", { encargos });
    return publicAccount(updated);
  });

const releaseInput = z.object({
  brand: brandSchema,
  habilitar: z.boolean(),
  confirmo: z.literal(true),
});
/** Production only. Enabling re-runs the live connection test and refuses on any failure. */
export const releaseBillingAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof releaseInput>) => releaseInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    const acc = await ensureBillingAccount(data.brand, "producao");
    if (!data.habilitar) {
      const updated = await updateBillingAccount(acc.id, { emissao_habilitada: false });
      await billingAccountEvent(
        acc.id,
        "desligar",
        true,
        ctx.userId,
        "Emissão em produção desligada",
      );
      return publicAccount(updated);
    }
    const refuse = async (mensagem: string, detalhe: Record<string, unknown> = {}) => {
      await billingAccountEvent(acc.id, "liberacao_recusada", false, ctx.userId, mensagem, detalhe);
      throw new Error(mensagem);
    };
    const cred = readSicrediCredentials(data.brand, "producao");
    if (!cred.ok) return refuse("Conta de produção não configurada no servidor.");
    if (!acc.consulta_ok_em)
      return refuse('Faça "Testar conexão" em produção com sucesso antes de liberar.');
    const r = await testSicrediConnection(cred.credentials);
    const now = new Date().toISOString();
    if (!r.tokenOk || !r.consultaOk) {
      await updateBillingAccount(acc.id, {
        ultimo_teste_em: now,
        ultimo_teste_ok: false,
        ultimo_teste_mensagem: r.mensagem.slice(0, 400),
      });
      return refuse(`Liberação recusada: a revalidação falhou. ${r.mensagem}`, {
        tokenOk: r.tokenOk,
        consultaOk: r.consultaOk,
        status: r.status,
      });
    }
    const updated = await updateBillingAccount(acc.id, {
      emissao_habilitada: true,
      liberado_por: ctx.userId,
      liberado_em: now,
      autenticado_em: now,
      consulta_ok_em: now,
      ultimo_teste_em: now,
      ultimo_teste_ok: true,
      ultimo_teste_mensagem: r.mensagem.slice(0, 400),
    });
    await billingAccountEvent(
      acc.id,
      "liberar",
      true,
      ctx.userId,
      "Emissão em produção liberada após revalidação",
    );
    return publicAccount(updated);
  });

const liquidadosInput = accountKey.extend({ dia: isoSchema });
export const runLiquidadosDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof liquidadosInput>) => liquidadosInput.parse(d))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx);
    if (data.dia > todaySaoPaulo()) throw new Error("Escolha um dia que já passou.");
    const acc = await ensureBillingAccount(data.brand, data.ambiente);
    const deps = flowDeps(
      { brand: data.brand, ambiente: data.ambiente as BillingAmbiente },
      ctx.userId,
    );
    const r = await applyLiquidadosDia(deps, {
      accountId: acc.id,
      ambiente: data.ambiente,
      dia: data.dia,
    });
    return r;
  });

export type { BoletoEstado };
