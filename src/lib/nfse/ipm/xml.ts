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
  refNfse?: string[];
  imovel?: {
    inscImobFisc?: string;
    cCIB?: string;
    end?: { cep: string; logradouro: string; numero: string; complemento?: string; bairro: string };
  };
};

export type NfsePayload = {
  teste: boolean;
  /** Data civil comprovada da prestação, não a data/hora de transmissão. */
  dataFatoGerador: string;
  layout?: "35/2021" | "122/2025";
  identificador?: string | null;
  valor: number;
  descritivo: string;
  observacao?: string | null;
  retencoes?: {
    ir: number;
    inss: number;
    contribuicaoSocial: number;
    rps: number;
    pis: number;
    cofins: number;
    iss: number;
  };
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

/**
 * Item da lista de serviço (LC 116): o XSD da IPM exige inteiro, sem ponto.
 * Aceita o valor do cadastro com máscara ("10.05") e normaliza:
 * - 4 dígitos → mantém ("10.05" → "1005");
 * - 3 dígitos → completa com zero à esquerda ("1.05" → "0105");
 * - 6 dígitos → mantém (desdobramento CGNFS-e, "10.05.01" → "100501");
 * - qualquer outro tamanho → erro, para não enviar XML inválido.
 */
export function normalizeItemListaServico(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/[.\s]/g, "");
  if (!/^\d+$/.test(digits)) throw new Error("Código do item da lista de serviço inválido.");
  if (digits.length === 4 || digits.length === 6) return digits;
  if (digits.length === 3) return digits.padStart(4, "0");
  throw new Error(
    `Código do item da lista de serviço inválido ("${value ?? ""}"): use 4 dígitos (ex.: 10.05) ou o desdobramento de 6 dígitos (ex.: 10.05.01).`,
  );
}

/** Decimal brasileiro com vírgula, sempre com duas casas. */
export function decimalBR(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) throw new Error("Valor fiscal inválido.");
  return value.toFixed(fractionDigits).replace(".", ",");
}

function tag(name: string, value: string): string {
  return `<${name}>${value}</${name}>`;
}

/** CPF/CNPJ do tomador: dígitos e letras maiúsculas (CNPJ alfanumérico a partir de 07/2026). */
export function normalizeTaxDoc(value: string | null | undefined): string {
  // Apenas a máscara permitida é removida. Não truncar nem apagar caracteres
  // desconhecidos: a validação precisa rejeitá-los, sem mudar a identidade.
  return String(value ?? "")
    .toUpperCase()
    .replace(/[.\s/-]/g, "");
}

export function inferTomadorTipo(cpfCnpj: string | null | undefined): NfseTomadorTipo {
  return normalizeTaxDoc(cpfCnpj).length > 11 ? "J" : "F";
}

export function civilDateBR(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Data do fato gerador inválida: use AAAA-MM-DD.");
  const [, year, month, day] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (
    Number(year) < 1900 ||
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > days
  )
    throw new Error("Data do fato gerador inválida.");
  return `${day}/${month}/${year}`;
}

/** Valida grupos conforme a NTE 122/2025 v1.7, sem escolher enquadramento. */
export function assertNfsePayload(payload: NfsePayload): void {
  civilDateBR(payload.dataFatoGerador);
  if (!Number.isFinite(payload.valor) || payload.valor <= 0)
    throw new Error("Valor do serviço inválido.");
  const validDoc = (v: string | null | undefined) =>
    /^(?:\d{11}|[0-9A-Z]{12}\d{2})$/.test(normalizeTaxDoc(v));
  if (!validDoc(payload.prestador.cpfCnpj)) throw new Error("Documento do prestador inválido.");
  if (payload.tomador.tipo !== "E" && !validDoc(payload.tomador.cpfCnpj))
    throw new Error("Documento do tomador inválido.");
  const service = normalizeItemListaServico(payload.item.codigoItemListaServico).slice(0, 4);
  const nbs = String(payload.item.codigoNbs ?? "").replace(/[.\s]/g, "");
  if ((payload.layout === "122/2025" || payload.ibsCbs || nbs) && !/^\d{9}$/.test(nbs))
    throw new Error("Código NBS aprovado de 9 dígitos é obrigatório para este layout.");
  if (
    payload.retencoes &&
    Object.values(payload.retencoes).some((v) => !Number.isFinite(v) || v < 0)
  )
    throw new Error("Valores de retenção inválidos.");
  const g = payload.ibsCbs;
  if (!g) return;
  for (const [name, value, pattern] of [
    ["cLocalidadeIncid", g.cLocalidadeIncid, /^\d{7}$/],
    ["cIndOp", g.cIndOp, /^\d{6}$/],
    ["CST", g.cst, /^\d{3}$/],
    ["cClassTrib", g.cClassTrib, /^\d{6}$/],
    ["finNFSe", g.finNFSe, /^\d$/],
    ["indFinal", g.indFinal, /^[01]$/],
  ] as const) {
    if (!pattern.test(value ?? ""))
      throw new Error(`Informe ${name} conforme o perfil fiscal aprovado.`);
  }
  const requiresTpOper = ["2505", "1509", "1712", "1005"].includes(service);
  if (requiresTpOper && !g.tpOper)
    throw new Error("Informe tpOper aprovado para a operação imobiliária.");
  if (g.tpOper && (!requiresTpOper || !/^[1-5]$/.test(g.tpOper)))
    throw new Error("tpOper não aplicável ao serviço configurado.");
  const needsReferences = g.tpOper === "2" || g.tpOper === "3";
  const refs = g.refNfse ?? [];
  if (needsReferences && refs.length === 0)
    throw new Error("tpOper 2 ou 3 exige NFS-e referenciada.");
  if (
    (!needsReferences && refs.length) ||
    refs.some((r) => !/^\d{50}$/.test(r)) ||
    new Set(refs).size !== refs.length
  )
    throw new Error("Referências de NFS-e inválidas para o tipo de operação.");
  const needsProperty = ["020101", "020201", "020301"].includes(g.cIndOp);
  if (!needsProperty && g.imovel)
    throw new Error("Grupo imóvel não aplicável ao indicador de operação.");
  if (needsProperty) {
    if (!g.imovel?.cCIB && !g.imovel?.end)
      throw new Error("A operação exige CIB ou endereço fiscal do imóvel.");
    if (g.imovel?.cCIB && !/^[0-9A-Z]{8}$/.test(g.imovel.cCIB))
      throw new Error("CIB deve ter 8 caracteres.");
    const end = g.imovel?.end;
    if (
      end &&
      (!/^\d{8}$/.test(onlyDigits(end.cep)) ||
        !end.logradouro.trim() ||
        !end.numero.trim() ||
        !end.bairro.trim())
    )
      throw new Error("Endereço fiscal do imóvel incompleto.");
  }
}

export type NfseConsultInput =
  { codigoAutenticidade: string } | { numero: string; serie: string; cadastro: string };

/** Consulta somente de leitura documentada na NTE 35/2021, §4.5. */
export function buildNfseConsultXml(input: NfseConsultInput): string {
  if ("codigoAutenticidade" in input) {
    const value = input.codigoAutenticidade.trim();
    if (!value || value.length > 40 || Array.from(value).some((char) => char.charCodeAt(0) < 32))
      throw new Error("Código de autenticidade inválido.");
    return `<nfse><pesquisa>${tag("codigo_autenticidade", escapeXml(value))}</pesquisa></nfse>`;
  }
  if (
    !/^\d{1,9}$/.test(input.numero) ||
    !/^\d$/.test(input.serie) ||
    !/^\d{1,9}$/.test(input.cadastro)
  )
    throw new Error("A consulta exige número, série e cadastro econômico válidos.");
  return `<nfse><pesquisa>${tag("numero", input.numero)}${tag("serie_nfse", input.serie)}${tag("cadastro", input.cadastro)}</pesquisa></nfse>`;
}

/** Monta o XML de envio conforme §5.1/§5.4 da NTE 122/2025. */
export function buildNfseXml(payload: NfsePayload): string {
  assertNfsePayload(payload);
  const t = payload.tomador;
  const i = payload.item;
  const lines: string[] = [];

  lines.push("<nfse>");
  lines.push(`  ${tag("nfse_teste", payload.teste ? "1" : "0")}`);
  if (payload.identificador) {
    lines.push(`  ${tag("identificador", sanitizeText(payload.identificador, 80))}`);
  }

  lines.push("  <nf>");
  lines.push(`    ${tag("data_fato_gerador", civilDateBR(payload.dataFatoGerador))}`);
  lines.push(`    ${tag("valor_total", decimalBR(payload.valor))}`);
  lines.push(`    ${tag("valor_desconto", decimalBR(0))}`);
  lines.push(`    ${tag("valor_ir", decimalBR(payload.retencoes?.ir ?? 0))}`);
  lines.push(`    ${tag("valor_inss", decimalBR(payload.retencoes?.inss ?? 0))}`);
  lines.push(
    `    ${tag("valor_contribuicao_social", decimalBR(payload.retencoes?.contribuicaoSocial ?? 0))}`,
  );
  lines.push(`    ${tag("valor_rps", decimalBR(payload.retencoes?.rps ?? 0))}`);
  if (payload.retencoes) {
    lines.push(`    ${tag("valor_pis", decimalBR(payload.retencoes.pis))}`);
    lines.push(`    ${tag("valor_cofins", decimalBR(payload.retencoes.cofins))}`);
  }
  lines.push(`    ${tag("observacao", sanitizeText(payload.observacao ?? "", 255))}`);
  if (payload.ibsCbs) {
    lines.push("    <IBSCBS>");
    lines.push(`      ${tag("cLocalidadeIncid", onlyDigits(payload.ibsCbs.cLocalidadeIncid, 7))}`);
    lines.push("    </IBSCBS>");
  }
  lines.push("  </nf>");

  lines.push("  <prestador>");
  lines.push(`    ${tag("cpfcnpj", normalizeTaxDoc(payload.prestador.cpfCnpj))}`);
  lines.push(`    ${tag("cidade", onlyDigits(payload.prestador.cidadeTom, 9))}`);
  lines.push("  </prestador>");

  lines.push("  <tomador>");
  lines.push(`    ${tag("tipo", t.tipo)}`);
  if (t.cpfCnpj) lines.push(`    ${tag("cpfcnpj", normalizeTaxDoc(t.cpfCnpj))}`);
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
    `      ${tag("codigo_item_lista_servico", normalizeItemListaServico(i.codigoItemListaServico))}`,
  );
  const nbs = onlyDigits(i.codigoNbs, 9);
  if (nbs) lines.push(`      ${tag("codigo_nbs", nbs)}`);
  lines.push(`      ${tag("descritivo", sanitizeText(payload.descritivo, 1000))}`);
  lines.push(`      ${tag("aliquota_item_lista_servico", decimalBR(i.aliquota, 4))}`);
  lines.push(`      ${tag("situacao_tributaria", onlyDigits(i.situacaoTributaria, 4))}`);
  lines.push(`      ${tag("valor_tributavel", decimalBR(payload.valor))}`);
  lines.push(`      ${tag("valor_deducao", decimalBR(0))}`);
  lines.push(`      ${tag("valor_issrf", decimalBR(payload.retencoes?.iss ?? 0))}`);
  lines.push(`      ${tag("valor_desconto_incondicional", decimalBR(0))}`);
  lines.push(`      ${tag("tributa_municipio_prestador", i.tributaMunicipioPrestador)}`);
  lines.push("    </lista>");
  lines.push("  </itens>");

  if (payload.ibsCbs) {
    const g = payload.ibsCbs;
    lines.push("  <IBSCBS>");
    lines.push(`    ${tag("finNFSe", g.finNFSe!)}`);
    lines.push(`    ${tag("indFinal", g.indFinal!)}`);
    lines.push(`    ${tag("cIndOp", onlyDigits(g.cIndOp, 6))}`);
    if (g.tpOper) lines.push(`    ${tag("tpOper", g.tpOper)}`);
    if (g.refNfse?.length) {
      lines.push("    <gRefNFSe>");
      for (const ref of g.refNfse) lines.push(`      ${tag("refNFSe", ref)}`);
      lines.push("    </gRefNFSe>");
    }
    if (g.imovel) {
      lines.push("    <imovel>");
      if (g.imovel.inscImobFisc)
        lines.push(`      ${tag("inscImobFisc", sanitizeText(g.imovel.inscImobFisc, 30))}`);
      if (g.imovel.cCIB) lines.push(`      ${tag("cCIB", g.imovel.cCIB)}`);
      if (g.imovel.end) {
        const end = g.imovel.end;
        lines.push("      <end>");
        lines.push(`        ${tag("CEP", onlyDigits(end.cep))}`);
        lines.push(`        ${tag("xLgr", sanitizeText(end.logradouro, 255))}`);
        lines.push(`        ${tag("nro", sanitizeText(end.numero, 60))}`);
        if (end.complemento)
          lines.push(`        ${tag("xCpl", sanitizeText(end.complemento, 255))}`);
        lines.push(`        ${tag("xBairro", sanitizeText(end.bairro, 60))}`);
        lines.push("      </end>");
      }
      lines.push("    </imovel>");
    }
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
