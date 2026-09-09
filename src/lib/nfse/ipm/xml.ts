/**
 * Builder e parser do layout IPM REST (NTE 122/2025 — dados da Reforma
 * Tributária IBS/CBS), usado pelo município de Santa Rosa/RS (Atende.Net).
 *
 * Este arquivo é puro (sem imports de servidor) para permitir testes unitários
 * com `node --test`.
 */

export type NfseTomadorTipo = "F" | "J" | "E";

export type NfseIbsCbs = {
  cLocalidadeIncid: string;
  cIndOp: string;
  cst: string;
  cClassTrib: string;
  finNFSe?: string;
  indFinal?: string;
  tpOper?: string;
};

export type NfsePayload = {
  teste: boolean;
  identificador?: string | null;
  valor: number;
  descritivo: string;
  observacao?: string | null;
  prestador: {
    cpfCnpj: string;
    cidadeTom: string;
  };
  tomador: {
    tipo: NfseTomadorTipo;
    cpfCnpj?: string | null;
    nomeRazaoSocial: string;
    logradouro?: string | null;
    numeroResidencia?: string | null;
    complemento?: string | null;
    bairro?: string | null;
    cidadeTom?: string | null;
    cep?: string | null;
    dddFone?: string | null;
    fone?: string | null;
    email?: string | null;
  };
  item: {
    codigoLocalPrestacaoServico: string;
    codigoItemListaServico: string;
    codigoNbs?: string | null;
    aliquota: number;
    situacaoTributaria: string;
    tributaMunicipioPrestador: "S" | "N";
  };
  ibsCbs?: NfseIbsCbs | null;
};

export type NfseParsedResponse = {
  ok: boolean;
  /** teste_ok quando o município apenas validou o XML. */
  testeValidado: boolean;
  numeroNfse: string | null;
  codigoVerificador: string | null;
  linkPdf: string | null;
  mensagem: string | null;
  codigosErro: string[];
};

/** Escapa os cinco caracteres previstos no manual (§ observações de layout). */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Texto livre: o layout IPM não aceita a barra "/" e nem quebras de linha
 * dentro das tags. Trocamos por hífen/espaço e normalizamos espaços.
 */
export function sanitizeText(value: string | null | undefined, maxLength?: number): string {
  const base = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\//g, "-")
    .replace(/\s{2,}/g, " ")
    .trim();
  const cut = maxLength ? base.slice(0, maxLength) : base;
  return escapeXml(cut);
}

/** Somente dígitos (documentos, CEP, telefone, códigos). */
export function onlyDigits(value: string | null | undefined, maxLength?: number): string {
  const digits = String(value ?? "").replace(/\D+/g, "");
  return maxLength ? digits.slice(0, maxLength) : digits;
}

/** Decimal brasileiro com vírgula, sempre com duas casas. */
export function decimalBR(value: number, fractionDigits = 2): string {
  const n = Number.isFinite(value) ? value : 0;
  return n.toFixed(fractionDigits).replace(".", ",");
}

function tag(name: string, value: string): string {
  return `<${name}>${value}</${name}>`;
}

export function inferTomadorTipo(cpfCnpj: string | null | undefined): NfseTomadorTipo {
  return onlyDigits(cpfCnpj).length > 11 ? "J" : "F";
}

/** Monta o XML de envio conforme §5.1/§5.4 da NTE 122/2025. */
export function buildNfseXml(payload: NfsePayload): string {
  const t = payload.tomador;
  const i = payload.item;
  const lines: string[] = [];

  lines.push("<nfse>");
  lines.push(`  ${tag("nfse_teste", payload.teste ? "1" : "0")}`);
  if (payload.identificador) {
    lines.push(`  ${tag("identificador", sanitizeText(payload.identificador, 80))}`);
  }

  lines.push("  <nf>");
  lines.push(`    ${tag("valor_total", decimalBR(payload.valor))}`);
  lines.push(`    ${tag("valor_desconto", decimalBR(0))}`);
  lines.push(`    ${tag("valor_ir", decimalBR(0))}`);
  lines.push(`    ${tag("valor_inss", decimalBR(0))}`);
  lines.push(`    ${tag("valor_contribuicao_social", decimalBR(0))}`);
  lines.push(`    ${tag("valor_rps", decimalBR(0))}`);
  lines.push(`    ${tag("observacao", sanitizeText(payload.observacao ?? "", 255))}`);
  if (payload.ibsCbs) {
    lines.push("    <IBSCBS>");
    lines.push(
      `      ${tag("cLocalidadeIncid", onlyDigits(payload.ibsCbs.cLocalidadeIncid, 7))}`,
    );
    lines.push("    </IBSCBS>");
  }
  lines.push("  </nf>");

  lines.push("  <prestador>");
  lines.push(`    ${tag("cpfcnpj", onlyDigits(payload.prestador.cpfCnpj, 14))}`);
  lines.push(`    ${tag("cidade", onlyDigits(payload.prestador.cidadeTom, 9))}`);
  lines.push("  </prestador>");

  lines.push("  <tomador>");
  lines.push(`    ${tag("tipo", t.tipo)}`);
  if (t.cpfCnpj) lines.push(`    ${tag("cpfcnpj", onlyDigits(t.cpfCnpj, 14))}`);
  lines.push(`    ${tag("nome_razao_social", sanitizeText(t.nomeRazaoSocial, 150))}`);
  if (t.logradouro) lines.push(`    ${tag("logradouro", sanitizeText(t.logradouro, 70))}`);
  if (t.numeroResidencia)
    lines.push(`    ${tag("numero_residencia", sanitizeText(t.numeroResidencia, 8))}`);
  if (t.complemento) lines.push(`    ${tag("complemento", sanitizeText(t.complemento, 50))}`);
  if (t.bairro) lines.push(`    ${tag("bairro", sanitizeText(t.bairro, 30))}`);
  if (t.cidadeTom) lines.push(`    ${tag("cidade", onlyDigits(t.cidadeTom, 9))}`);
  if (t.cep) lines.push(`    ${tag("cep", onlyDigits(t.cep, 8))}`);
  if (t.dddFone) lines.push(`    ${tag("ddd_fone_comercial", onlyDigits(t.dddFone, 3))}`);
  if (t.fone) lines.push(`    ${tag("fone_comercial", onlyDigits(t.fone, 9))}`);
  if (t.email) lines.push(`    ${tag("email", sanitizeText(t.email, 100))}`);
  lines.push("  </tomador>");

  lines.push("  <itens>");
  lines.push("    <lista>");
  lines.push(
    `      ${tag("codigo_local_prestacao_servico", onlyDigits(i.codigoLocalPrestacaoServico, 9))}`,
  );
  lines.push(
    `      ${tag("codigo_item_lista_servico", sanitizeText(i.codigoItemListaServico, 10))}`,
  );
  if (i.codigoNbs) lines.push(`      ${tag("codigo_nbs", sanitizeText(i.codigoNbs, 9))}`);
  lines.push(`      ${tag("descritivo", sanitizeText(payload.descritivo, 1000))}`);
  lines.push(`      ${tag("aliquota_item_lista_servico", decimalBR(i.aliquota, 4))}`);
  lines.push(`      ${tag("situacao_tributaria", sanitizeText(i.situacaoTributaria, 4))}`);
  lines.push(`      ${tag("valor_tributavel", decimalBR(payload.valor))}`);
  lines.push(`      ${tag("valor_deducao", decimalBR(0))}`);
  lines.push(`      ${tag("valor_issrf", decimalBR(0))}`);
  lines.push(`      ${tag("valor_desconto_incondicional", decimalBR(0))}`);
  lines.push(
    `      ${tag("tributa_municipio_prestador", i.tributaMunicipioPrestador)}`,
  );
  lines.push("    </lista>");
  lines.push("  </itens>");

  if (payload.ibsCbs) {
    const g = payload.ibsCbs;
    lines.push("  <IBSCBS>");
    lines.push(`    ${tag("finNFSe", onlyDigits(g.finNFSe ?? "0", 2) || "0")}`);
    lines.push(`    ${tag("indFinal", onlyDigits(g.indFinal ?? "0", 2) || "0")}`);
    lines.push(`    ${tag("cIndOp", onlyDigits(g.cIndOp, 6))}`);
    lines.push(`    ${tag("tpOper", onlyDigits(g.tpOper ?? "1", 2) || "1")}`);
    lines.push("    <valores>");
    lines.push("      <trib>");
    lines.push("        <gIBSCBS>");
    lines.push(`          ${tag("CST", onlyDigits(g.cst, 3))}`);
    lines.push(`          ${tag("cClassTrib", onlyDigits(g.cClassTrib, 6))}`);
    lines.push("        </gIBSCBS>");
    lines.push("      </trib>");
    lines.push("    </valores>");
    lines.push("  </IBSCBS>");
  }

  lines.push("</nfse>");
  return lines.join("\n");
}

function firstTagValue(xml: string, names: string[]): string | null {
  for (const name of names) {
    const match = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml);
    const value = match?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

/** Interpreta o retorno síncrono do WNERestServiceNFSe. */
export function parseNfseResponse(raw: string): NfseParsedResponse {
  const xml = String(raw ?? "");
  const numeroNfse = firstTagValue(xml, ["numero_nfse", "nro_nfse", "numero"]);
  const codigoVerificador = firstTagValue(xml, [
    "codigo_verificacao",
    "codigo_verificador",
    "cod_verificador",
  ]);
  const linkPdf = firstTagValue(xml, ["link_nfse", "link", "url_nfse", "pdf"]);
  const mensagem = firstTagValue(xml, ["codigo", "mensagem", "descricao", "erro"]);

  const codigosErro = Array.from(xml.matchAll(/<codigo>\s*(\d{3,6})\s*<\/codigo>/gi)).map(
    (m) => m[1] as string,
  );

  const testeValidado = /v[áa]lida\s+para\s+emiss[ãa]o/i.test(xml);
  const ok = testeValidado || Boolean(numeroNfse) || /sucesso/i.test(xml);

  return {
    ok: ok && codigosErro.length === 0,
    testeValidado,
    numeroNfse,
    codigoVerificador,
    linkPdf,
    mensagem,
    codigosErro,
  };
}
