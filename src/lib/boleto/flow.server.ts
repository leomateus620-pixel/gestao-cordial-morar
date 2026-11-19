/**
 * Server-only boleto flows with injected storage and bank client, so the same code runs in
 * server functions and in tests. One POST per title, never retried; uncertainty is recorded.
 */
import type { BoletoSnapshot } from "./preview";
import { estadoFromSituacao, type BillingAmbiente, type BoletoEstado } from "./rules";
import { buildCadastroBody, pagadorParaEnvio } from "./sicredi/body";
import type { SicrediCobrancaClient } from "./sicredi/cobranca.server";
import { SicrediError } from "./sicredi/http.server";

export type BoletoRow = {
  id: string;
  contract_id: string;
  account_id: string;
  brand: string;
  ambiente: BillingAmbiente;
  competencia: string;
  ocorrencia: number;
  seu_numero: string;
  id_titulo_empresa: string;
  estado: BoletoEstado;
  pdf_estado: "pendente" | "pronto" | "erro";
  snapshot: BoletoSnapshot;
  total_centavos: number;
  vencimento: string;
  nosso_numero: string | null;
  linha_digitavel: string | null;
  codigo_barras: string | null;
  linha_validada: boolean | null;
  pdf_path: string | null;
  situacao_banco: string | null;
  liquidacao_evidencia: unknown;
  ultimo_erro: string | null;
  emission_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export type TransitionMeta = {
  http?: number | null;
  mensagem?: string;
  detalhe?: Record<string, unknown>;
};
export interface BoletoStore {
  prepare(a: {
    contractId: string;
    accountId: string;
    competencia: string;
    snapshot: BoletoSnapshot;
    totalCentavos: number;
    vencimento: string;
    actor: string;
  }): Promise<{ id: string; estado: BoletoEstado; created: boolean }>;
  get(id: string): Promise<BoletoRow | null>;
  transition(
    id: string,
    from: BoletoEstado[],
    to: BoletoEstado,
    patch: Record<string, unknown>,
    actor: string,
    meta?: TransitionMeta,
  ): Promise<BoletoRow | null>;
  uploadPdf(path: string, bytes: Uint8Array): Promise<void>;
  /** Production only: mirrors the registered title into rental_emissions. */
  recordEmission(row: BoletoRow, actor: string): Promise<string | null>;
  findByNossoNumero(accountId: string, nossos: string[]): Promise<BoletoRow[]>;
}
export type FlowDeps = {
  store: BoletoStore;
  client: SicrediCobrancaClient;
  codigoBeneficiario: string;
  actor: string;
};

const errMessage = (e: unknown) =>
  e instanceof SicrediError ? e.message : "Falha inesperada ao falar com o Sicredi.";
export const boletoPdfPath = (
  r: Pick<BoletoRow, "contract_id" | "competencia" | "seu_numero" | "ambiente">,
) => `${r.contract_id}/boletos/${r.competencia}-${r.seu_numero}-${r.ambiente}.pdf`;

export async function storeBoletoPdf(deps: FlowDeps, row: BoletoRow): Promise<BoletoRow> {
  if (!row.linha_digitavel) return row;
  try {
    const bytes = await deps.client.pdf(row.linha_digitavel);
    const path = boletoPdfPath(row);
    await deps.store.uploadPdf(path, bytes);
    return (
      (await deps.store.transition(
        row.id,
        [row.estado],
        row.estado,
        { pdf_estado: "pronto", pdf_path: path, ultimo_erro: null },
        deps.actor,
        {
          mensagem: "PDF guardado",
        },
      )) ?? row
    );
  } catch (e) {
    return (
      (await deps.store.transition(
        row.id,
        [row.estado],
        row.estado,
        { pdf_estado: "erro", ultimo_erro: errMessage(e) },
        deps.actor,
        {
          http: e instanceof SicrediError ? e.status : null,
          mensagem: "PDF pendente: o título continua registrado",
        },
      )) ?? row
    );
  }
}

/** PDF (failure never undoes the title) + production mirror in rental_emissions. */
export async function finishRegisteredBoleto(deps: FlowDeps, row: BoletoRow): Promise<BoletoRow> {
  let current = row.pdf_estado === "pronto" ? row : await storeBoletoPdf(deps, row);
  if (current.ambiente === "producao") {
    try {
      const emissionId = await deps.store.recordEmission(current, deps.actor);
      if (emissionId && emissionId !== current.emission_id)
        current =
          (await deps.store.transition(
            current.id,
            [current.estado],
            current.estado,
            { emission_id: emissionId },
            deps.actor,
            {
              mensagem: "Registrado nas emissões do aluguel",
            },
          )) ?? current;
    } catch {
      /* the title stays registered; the emission mirror can be retried with the PDF */
    }
  }
  return current;
}

export type IssueOutcome = { row: BoletoRow; enviado: boolean; reaproveitado: boolean };

/** Prepares (idempotent) and sends one title. Only the caller that wins preparando→enviando posts. */
export async function issuePreparedBoleto(
  deps: FlowDeps,
  input: { contractId: string; accountId: string; snapshot: BoletoSnapshot },
): Promise<IssueOutcome> {
  const prepareArgs = {
    contractId: input.contractId,
    accountId: input.accountId,
    competencia: input.snapshot.competencia,
    snapshot: input.snapshot,
    totalCentavos: input.snapshot.total_centavos,
    vencimento: input.snapshot.vencimento.data,
    actor: deps.actor,
  };
  let prep = await deps.store.prepare(prepareArgs);
  let row = await deps.store.get(prep.id);
  if (!row) throw new Error("Boleto preparado não encontrado.");
  if (
    !prep.created &&
    row.estado === "preparando" &&
    (row.total_centavos !== input.snapshot.total_centavos ||
      row.vencimento !== input.snapshot.vencimento.data)
  ) {
    await deps.store.transition(
      row.id,
      ["preparando"],
      "rejeitado",
      { ultimo_erro: "Preparação antiga descartada (valores mudaram)." },
      deps.actor,
      {
        mensagem: "Preparação antiga descartada antes do envio",
      },
    );
    prep = await deps.store.prepare(prepareArgs);
    row = await deps.store.get(prep.id);
    if (!row) throw new Error("Boleto preparado não encontrado.");
  }
  if (row.estado !== "preparando") return { row, enviado: false, reaproveitado: true };
  let body;
  try {
    body = buildCadastroBody({
      codigoBeneficiario: deps.codigoBeneficiario,
      seuNumero: row.seu_numero,
      idTituloEmpresa: row.id_titulo_empresa,
      vencimento: row.vencimento,
      totalCentavos: row.total_centavos,
      pagador: pagadorParaEnvio(row.ambiente, row.snapshot.pagador),
      encargos: row.snapshot.encargos,
    });
  } catch (e) {
    const rejected = await deps.store.transition(
      row.id,
      ["preparando"],
      "rejeitado",
      { ultimo_erro: e instanceof Error ? e.message : "Dados inválidos." },
      deps.actor,
      {
        mensagem: "Dados inválidos antes do envio",
      },
    );
    return { row: rejected ?? row, enviado: false, reaproveitado: false };
  }
  const sending = await deps.store.transition(row.id, ["preparando"], "enviando", {}, deps.actor, {
    mensagem: "Enviando ao Sicredi",
  });
  if (!sending)
    return { row: (await deps.store.get(row.id)) ?? row, enviado: false, reaproveitado: true };
  try {
    const result = await deps.client.cadastrar(body);
    const registered = await deps.store.transition(
      row.id,
      ["enviando"],
      "registrado",
      {
        nosso_numero: result.nossoNumero,
        linha_digitavel: result.linhaDigitavel,
        codigo_barras: result.codigoBarras,
        linha_validada: row.ambiente === "producao",
        ultimo_erro: null,
      },
      deps.actor,
      { http: 201, mensagem: "Título registrado no Sicredi" },
    );
    if (!registered) throw new Error("Estado do boleto mudou durante o envio.");
    return {
      row: await finishRegisteredBoleto(deps, registered),
      enviado: true,
      reaproveitado: false,
    };
  } catch (e) {
    const definite = e instanceof SicrediError && !e.incerto;
    const next = await deps.store.transition(
      row.id,
      ["enviando"],
      definite ? "rejeitado" : "incerto",
      { ultimo_erro: errMessage(e) },
      deps.actor,
      {
        http: e instanceof SicrediError ? e.status : null,
        mensagem: definite
          ? "Sicredi recusou o título"
          : "Resultado incerto: conferir antes de qualquer novo envio",
      },
    );
    return {
      row: next ?? (await deps.store.get(row.id)) ?? row,
      enviado: true,
      reaproveitado: false,
    };
  }
}

export const STALE_SENDING_MS = 2 * 60_000;

/** Resolves an uncertain title: production asks "cadastrados" by seuNumero; release needs a reason. */
export async function reconcileUncertainBoleto(
  deps: FlowDeps,
  row: BoletoRow,
  opts: { liberarMotivo?: string | null; now?: number } = {},
): Promise<{ row: BoletoRow; mensagem: string }> {
  const now = opts.now ?? Date.now();
  if (row.estado === "enviando" && now - new Date(row.updated_at).getTime() < STALE_SENDING_MS)
    return { row, mensagem: "O envio ainda está em andamento. Aguarde alguns minutos." };
  if (row.estado !== "incerto" && row.estado !== "enviando")
    return { row, mensagem: "Este boleto não está com resultado incerto." };
  const from: BoletoEstado[] = ["incerto", "enviando"];
  if (row.ambiente === "producao") {
    let found;
    try {
      found = (await deps.client.cadastrados(row.seu_numero))[0];
    } catch (e) {
      return { row, mensagem: `Não foi possível conferir no Sicredi: ${errMessage(e)}` };
    }
    if (found) {
      const registered = await deps.store.transition(
        row.id,
        from,
        "registrado",
        {
          nosso_numero: found.nossoNumero,
          linha_digitavel: found.linhaDigitavel,
          codigo_barras: found.codigoBarras,
          linha_validada: true,
          ultimo_erro: null,
        },
        deps.actor,
        { http: 200, mensagem: "Conciliado: título encontrado no Sicredi" },
      );
      if (!registered) return { row, mensagem: "O boleto mudou de estado; atualize a tela." };
      return {
        row: await finishRegisteredBoleto(deps, registered),
        mensagem: "Título encontrado e registrado.",
      };
    }
  }
  const motivo = (opts.liberarMotivo ?? "").trim();
  if (!motivo)
    return {
      row,
      mensagem:
        row.ambiente === "producao"
          ? "Nenhum título com este número nas últimas 48 h. Se tiver certeza, confirme com um motivo."
          : "A homologação do Sicredi não oferece esta consulta. Se tiver certeza, confirme com um motivo.",
    };
  if (motivo.length < 10)
    return { row, mensagem: "Explique o motivo com pelo menos 10 caracteres." };
  const released = await deps.store.transition(
    row.id,
    from,
    "rejeitado",
    { ultimo_erro: "Liberado manualmente: não registrado." },
    deps.actor,
    {
      mensagem: "Liberado manualmente como não registrado",
      detalhe: { liberacao_manual: true, motivo: motivo.slice(0, 200) },
    },
  );
  return {
    row: released ?? row,
    mensagem: released
      ? "Liberado. Um novo boleto pode ser emitido."
      : "O boleto mudou de estado; atualize a tela.",
  };
}

/** Updates the bank situation. The sandbox answers fixed demo data, so it never changes state. */
export async function refreshRegisteredBoleto(
  deps: FlowDeps,
  row: BoletoRow,
): Promise<{ row: BoletoRow; mensagem: string }> {
  if (!row.nosso_numero || !["registrado", "baixa_solicitada", "liquidado"].includes(row.estado))
    return { row, mensagem: "Este boleto ainda não está registrado." };
  let consulta;
  try {
    consulta = await deps.client.consultar(row.nosso_numero);
  } catch (e) {
    return { row, mensagem: errMessage(e) };
  }
  const situacao = (consulta.situacao ?? "").slice(0, 80) || null;
  const target = row.ambiente === "producao" ? estadoFromSituacao(situacao) : null;
  const to: BoletoEstado =
    target === "liquidado" && row.estado !== "liquidado"
      ? "liquidado"
      : target === "baixado" && row.estado !== "liquidado"
        ? "baixado"
        : row.estado;
  const patch: Record<string, unknown> = { situacao_banco: situacao };
  if (to === "liquidado" && row.estado !== "liquidado")
    patch.liquidacao_evidencia = {
      fonte: "consulta",
      situacao,
      dataPagamento: consulta.dataPagamento,
      valorLiquidado: consulta.valorLiquidado,
      conferido_em: new Date().toISOString(),
    };
  const updated = await deps.store.transition(row.id, [row.estado], to, patch, deps.actor, {
    http: 200,
    mensagem:
      row.ambiente === "sandbox"
        ? "Situação consultada (retorno fixo da homologação)"
        : "Situação consultada",
  });
  let current = updated ?? row;
  if (current.pdf_estado !== "pronto" && current.linha_digitavel)
    current = await finishRegisteredBoleto(deps, current);
  return {
    row: current,
    mensagem:
      row.ambiente === "sandbox"
        ? `Homologação: o Sicredi devolve uma situação fixa (${situacao ?? "sem situação"}).`
        : `Situação no Sicredi: ${situacao ?? "não informada"}.`,
  };
}

/** Marks liquidation evidence only (never settles the rent in the Gestão). */
export async function applyLiquidadosDia(
  deps: FlowDeps,
  args: { accountId: string; ambiente: BillingAmbiente; dia: string; maxPaginas?: number },
): Promise<{ itens: number; conciliados: number; paginas: number; incompleto: boolean }> {
  let itens = 0;
  let conciliados = 0;
  let pagina = 0;
  const max = args.maxPaginas ?? 10;
  let hasNext = true;
  while (hasNext && pagina < max) {
    const res = await deps.client.liquidadosDia(args.dia, pagina);
    itens += res.items.length;
    hasNext = res.hasNext;
    pagina++;
    const nossos = res.items.map((i) => i.nossoNumero);
    if (!nossos.length) continue;
    const rows = await deps.store.findByNossoNumero(args.accountId, nossos);
    for (const r of rows) {
      if (!["registrado", "baixa_solicitada"].includes(r.estado)) continue;
      const item = res.items.find((i) => i.nossoNumero === r.nosso_numero);
      if (!item) continue;
      if (args.ambiente === "sandbox") {
        conciliados++;
        continue;
      }
      const done = await deps.store.transition(
        r.id,
        ["registrado", "baixa_solicitada"],
        "liquidado",
        {
          situacao_banco: "LIQUIDADO",
          liquidacao_evidencia: {
            fonte: "liquidados_dia",
            dia: args.dia,
            dataPagamento: item.dataPagamento,
            valorLiquidado: item.valorLiquidado,
            conferido_em: new Date().toISOString(),
          },
        },
        deps.actor,
        {
          http: 200,
          mensagem: "Liquidação encontrada (evidência; o aluguel não recebe baixa automática)",
        },
      );
      if (done) conciliados++;
    }
  }
  return { itens, conciliados, paginas: pagina, incompleto: hasNext };
}
