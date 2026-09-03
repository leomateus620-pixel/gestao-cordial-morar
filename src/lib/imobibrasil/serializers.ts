/**
 * Serialização do modelo local para o payload ImobiBrasil.
 *
 * O modelo local é a fonte de verdade e NUNCA é enviado diretamente à API:
 * este módulo é a única fronteira de tradução. Regras do contrato externo:
 *  - campos vazios são omitidos (nunca `null`, `""` ou `0` implícito);
 *  - decimais de área viajam como string com vírgula (`140,80`);
 *  - dinheiro viaja em reais inteiros, sem centavos implícitos;
 *  - booleanos viajam como `sim` / `nao` (sem acento) nos campos JSON — validado contra a API real;
 *  - `exibirEnderecoSite` usa exatamente `Personalizado` (P maiúsculo);
 *  - `tipoareaConstruida` mantém o `a` minúsculo do contrato;
 *  - `descricaoTipoImovel` só existe na criação.
 *
 * Módulo puro e sem dependências — coberto por `serializers.test.ts`.
 */

export type ImobiFinalidade = "venda" | "locacao" | "temporada";

export type LocalPropertyForSync = {
  id: string;
  referencia?: string | null;
  finalidade?: ImobiFinalidade | null;
  operacao?: string | null;
  tipo?: string | null;
  cep?: string | null;
  bairro?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  ponto_referencia?: string | null;
  mapa?: string | null;
  zona?: string | null;
  regiao?: string | null;
  exibir_endereco_site?: string | null;
  exibir_endereco_site_personalizado?: string[] | null;
  exibir_endereco_portal_personalizado?: string[] | null;
  area_privativa?: number | null;
  /** Campo do formulário: usado como área privativa quando esta não existe. */
  area_principal?: number | null;
  area_util?: number | null;
  area_total?: number | null;
  area_terreno?: number | null;
  area_construida?: number | null;
  terreno_frente?: number | null;
  terreno_fundo?: number | null;
  terreno_esquerda?: number | null;
  terreno_direita?: number | null;
  dormitorios?: number | null;
  suites?: number | null;
  banheiros?: number | null;
  salas?: number | null;
  vagas?: number | null;
  acomodacoes?: number | null;
  pavimento?: string | null;
  ano_construcao?: string | null;
  mobiliado?: string | null;
  descricao_imovel?: string | null;
  observacao_imovel?: string | null;
  pontos_fortes?: string | null;
  outras_informacoes?: string | null;
  destaque_inicial?: boolean | null;
  super_destaque_inicial?: boolean | null;
  valor?: number | null;
  valor_modo?: string | null;
  valor_iptu?: number | null;
  valor_condominio?: number | null;
  valor_taxas?: number | null;
  valor_observacao?: string | null;
  exibir_imovel?: boolean | null;
  exibir_corretor?: boolean | null;
  video?: string | null;
  tour_virtual?: string | null;
  tarja_imagem?: string | null;
  unidade?: string | null;
  torre_unica?: boolean | null;
  tratar_empreendimento?: boolean | null;
  numero_andar?: string | null;
  numero_torre?: string | null;
  nome_empreendimento?: string | null;
  descricao_empreendimento?: string | null;
  estagio_empreendimento?: string | null;
  inicio_previsao_empreendimento?: string | null;
  entrega_previsao_empreendimento?: string | null;
  disponibilizar_exportacao?: boolean | null;
  em_condominio?: boolean | null;
  exclusividade?: boolean | null;
  autorizacao?: boolean | null;
  averbada?: boolean | null;
  escriturada?: boolean | null;
  aceita_financiamento?: boolean | null;
  com_placa?: boolean | null;
  permuta?: boolean | null;
  disponibilidade?: string | null;
  local_chave?: string | null;
  origem_captacao?: string | null;
  seo_url?: string | null;
  seo_titulo?: string | null;
  seo_descricao?: string | null;
  disparar_periodico?: boolean | null;
  portais_convencional?: boolean | null;
  portais_destaque?: boolean | null;
  portais_super_destaque?: boolean | null;
  portais_super_destaque2?: boolean | null;
};

/** Códigos resolvidos no catálogo do provedor de destino. Nada aqui é adivinhado. */
export type ResolvedProviderCodes = {
  codigoTipoImovel?: string | null;
  descricaoTipoImovel?: string | null;
  codigoCidade?: string | null;
  codigoCorretor?: string | null;
  codigoProprietario?: string | null;
  codigoUsuarioAdicional?: string | null;
  tipoAreaPrivativa?: string | null;
  tipoAreaTotal?: string | null;
  tipoAreaTerreno?: string | null;
  tipoAreaConstruida?: string | null;
  tipoTerrenoFrente?: string | null;
  tipoTerrenoFundo?: string | null;
  tipoTerrenoEsquerda?: string | null;
  tipoTerrenoDireita?: string | null;
};

export type ImobiPayload = Record<string, string | number | string[]>;

const REFERENCE_PREFIX = "GC";

/** Referência externa estável derivada do UUID local — gerada uma vez, nunca muda. */
export function buildExternalReference(propertyId: string): string {
  const compact = propertyId.replace(/-/g, "").toUpperCase();
  return `${REFERENCE_PREFIX}-${compact.slice(0, 12)}`;
}

export function toFinalidade(property: LocalPropertyForSync): ImobiFinalidade {
  if (property.finalidade === "venda" || property.finalidade === "locacao" || property.finalidade === "temporada") {
    return property.finalidade;
  }
  return property.operacao === "aluguel" ? "locacao" : "venda";
}

/** `sim` / `nao` — formato aceito pela API (o valor com acento é recusado). */
export function boolToSimNao(value: boolean | null | undefined): "sim" | "nao" | undefined {
  if (value === null || value === undefined) return undefined;
  return value ? "sim" : "nao";
}

/**
 * Campos "liga/desliga" gravados como texto no banco (`true`/`false`, `sim`/`nao`).
 * A API recusa `true`/`false` literais, então normalizamos para `sim`/`nao`.
 */
export function flagToSimNao(value: string | boolean | null | undefined): "sim" | "nao" | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "boolean") return value ? "sim" : "nao";
  const text = value.trim().toLowerCase();
  if (!text) return undefined;
  if (["true", "sim", "s", "1", "yes"].includes(text)) return "sim";
  if (["false", "nao", "não", "n", "0", "no"].includes(text)) return "nao";
  return undefined;
}

/** `sim` / `nao` (sem acento) — exclusivo do multipart de imagem. */
export function boolToImageSimNao(value: boolean): "sim" | "nao" {
  return value ? "sim" : "nao";
}

/** Área decimal em string com vírgula. Zero e vazio são omitidos. */
export function areaToString(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const fixed = Math.round(value * 100) / 100;
  const text = Number.isInteger(fixed) ? String(fixed) : fixed.toFixed(2);
  return text.replace(".", ",");
}

/** Dinheiro em reais inteiros. "Consulte" nunca vira 0. */
export function moneyToString(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return String(Math.round(value));
}

export function intToString(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) return undefined;
  return String(Math.trunc(value));
}

export function textOrUndefined(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

/**
 * Texto livre para os sites (Cordial/Morar). O banco dos provedores não aceita
 * emojis nem símbolos fora do Latin-1: eles chegam como "????". Aqui:
 *  - marcadores decorativos viram "-";
 *  - demais pictogramas/variation selectors são removidos;
 *  - pontuação tipográfica vira ASCII equivalente;
 *  - acentos e cedilha são preservados;
 *  - quebras de linha viram <br /> para o site renderizar em tópicos.
 */
export function sanitizeRichText(value: string | null | undefined): string | undefined {
  const text = textOrUndefined(value);
  if (!text) return undefined;

  // Preserva o texto do corretor: acentos e cedilha seguem literais (Latin-1) e
  // emojis/pictogramas viram entidades HTML numéricas, que o site renderiza
  // como o ícone original mesmo com banco Latin-1.
  let out = text.normalize("NFC").replace(/\u00A0/g, " ");

  out = Array.from(out)
    .map((char) => {
      const code = char.codePointAt(0)!;
      if (char === "\n" || char === "\r" || char === "\t") return char;
      if (code >= 0x20 && code <= 0x7e) return char;
      if (code >= 0xa1 && code <= 0xff) return char;
      return `&#${code};`;
    })
    .join("");

  out = out
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!out) return undefined;
  return out.replace(/\r?\n/g, "<br />");
}

/**
 * Teto da API ImobiBrasil para a descrição. Medido em BYTES do texto já
 * sanitizado: acentos ocupam 2 bytes e cada emoji vira `&#128513;`, então o
 * texto digitado pode ser bem menor que esse número.
 */
export const IMOBI_DESCRICAO_MAX = 1500;

const encoder = new TextEncoder();

/** Tamanho em bytes (é assim que a API conta). */
export function byteLength(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Índice de corte seguro em `text` para caber em `max` bytes sem quebrar uma
 * entidade HTML (`&#128513;`) nem a tag `<br />`, preferindo o fim de um
 * parágrafo (`<br />`) ou de uma palavra.
 */
function safeCutIndex(text: string, budget: number): number {
  let cut = 0;
  let used = 0;
  for (const char of text) {
    const size = byteLength(char);
    if (used + size > budget) break;
    used += size;
    cut += char.length;
  }

  const amp = text.lastIndexOf("&", cut - 1);
  if (amp !== -1) {
    const end = text.indexOf(";", amp);
    if (end >= cut && /^&#\d*$/.test(text.slice(amp, cut))) cut = amp;
  }
  const lt = text.lastIndexOf("<", cut - 1);
  if (lt !== -1 && text.indexOf(">", lt) >= cut) cut = lt;

  const window = text.slice(0, cut);
  const lastBr = window.lastIndexOf("<br />");
  const lastSpace = window.lastIndexOf(" ");
  if (lastBr >= cut - 250 && lastBr > 0) return lastBr;
  if (lastSpace >= cut - 80 && lastSpace > 0) return lastSpace;
  return cut;
}

/**
 * Encurta o texto já sanitizado sem quebrar entidade HTML nem `<br />`.
 */
export function truncateSanitized(text: string, max = IMOBI_DESCRICAO_MAX): string {
  if (byteLength(text) <= max) return text;
  const suffix = "...";
  const cut = safeCutIndex(text, Math.max(1, max - suffix.length));
  const kept = text.slice(0, cut).replace(/(?:<br \/>|\s)+$/, "");
  return `${kept || text.slice(0, cut)}${suffix}`;
}

/**
 * Divide a descrição já sanitizada no teto da API: o começo vai para
 * `descricaoImovel` e o RESTO (sem duplicar nada, sem cortar entidade/tag)
 * segue para `pontosFortesImovel`, que também é publicado no site.
 */
export function splitSanitizedForSites(
  text: string,
  max = IMOBI_DESCRICAO_MAX,
): { head: string; overflow: string } {
  if (byteLength(text) <= max) return { head: text, overflow: "" };
  const cut = safeCutIndex(text, max);
  const head = text.slice(0, cut).replace(/(?:<br \/>|\s)+$/, "");
  const overflow = text.slice(cut).replace(/^(?:<br \/>|\s)+/, "");
  if (!head) return { head: truncateSanitized(text, max), overflow: "" };
  return { head, overflow };
}

/** Junta blocos já sanitizados em um único texto de site. */
function joinSanitized(...parts: Array<string | undefined>): string | undefined {
  const cleaned = parts.map((part) => part?.trim()).filter((part): part is string => !!part);
  if (!cleaned.length) return undefined;
  return cleaned.join("<br /><br />");
}

/** Tamanho (em bytes) que a descrição terá no payload dos sites — contador da UI. */
export function sanitizedLength(value: string | null | undefined): number {
  const out = sanitizeRichText(value);
  return out ? byteLength(out) : 0;
}






/** `Personalizado` com P maiúsculo quando aplicável. */
export function normalizeExibirEnderecoSite(value: string | null | undefined): string | undefined {
  const text = textOrUndefined(value);
  if (!text) return undefined;
  return text.toLowerCase() === "personalizado" ? "Personalizado" : text;
}

function assign(target: ImobiPayload, key: string, value: string | number | string[] | undefined) {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item).trim()).filter((item) => item.length > 0);
    if (cleaned.length) target[key] = cleaned;
    return;
  }
  if (typeof value === "string" && value.trim().length === 0) return;
  target[key] = value;
}

export type SerializeOptions = {
  /** `insert` inclui `descricaoTipoImovel`; `update` nunca envia esse campo. */
  mode: "insert" | "update";
};

export function serializeProperty(
  property: LocalPropertyForSync,
  codes: ResolvedProviderCodes,
  options: SerializeOptions,
): ImobiPayload {
  const payload: ImobiPayload = {};
  const isInsert = options.mode === "insert";

  // Identificação
  assign(payload, "codigoProprietario", textOrUndefined(codes.codigoProprietario));
  assign(payload, "codigoCorretor", textOrUndefined(codes.codigoCorretor));
  assign(payload, "codigoUsuarioAdicional", textOrUndefined(codes.codigoUsuarioAdicional));
  assign(payload, "finalidade", toFinalidade(property));
  if (isInsert) assign(payload, "descricaoTipoImovel", textOrUndefined(codes.descricaoTipoImovel ?? property.tipo));
  assign(payload, "codigoTipoImovel", textOrUndefined(codes.codigoTipoImovel));
  assign(payload, "referencia", textOrUndefined(property.referencia) ?? buildExternalReference(property.id));

  // Endereço
  assign(payload, "cep", textOrUndefined(property.cep));
  assign(payload, "bairro", textOrUndefined(property.bairro));
  assign(payload, "logradouro", textOrUndefined(property.logradouro));
  assign(payload, "codigoCidade", textOrUndefined(codes.codigoCidade));
  assign(payload, "numero", textOrUndefined(property.numero));
  assign(payload, "pontoReferencia", textOrUndefined(property.ponto_referencia));
  assign(payload, "complemento", textOrUndefined(property.complemento));
  assign(payload, "mapa", textOrUndefined(property.mapa));
  assign(payload, "zona", textOrUndefined(property.zona));
  assign(payload, "regiao", textOrUndefined(property.regiao));
  assign(payload, "exibirEnderecoSite", normalizeExibirEnderecoSite(property.exibir_endereco_site));
  assign(payload, "exibirEnderecoSitePersonalizado", property.exibir_endereco_site_personalizado ?? undefined);
  assign(payload, "exibirEnderecoPortalPersonalizado", property.exibir_endereco_portal_personalizado ?? undefined);

  // Áreas — o par valor/tipo só viaja quando ambos existem de fato.
  const areaPrivativa = areaToString(
    property.area_privativa ?? property.area_util ?? property.area_principal,
  );
  assign(payload, "areaPrivativa", areaPrivativa);
  if (areaPrivativa) assign(payload, "tipoAreaPrivativa", textOrUndefined(codes.tipoAreaPrivativa));
  const areaTotal = areaToString(property.area_total);
  assign(payload, "areaTotal", areaTotal);
  if (areaTotal) assign(payload, "tipoAreaTotal", textOrUndefined(codes.tipoAreaTotal));
  const areaTerreno = areaToString(property.area_terreno);
  assign(payload, "areaTerreno", areaTerreno);
  if (areaTerreno) assign(payload, "tipoAreaTerreno", textOrUndefined(codes.tipoAreaTerreno));
  const areaConstruida = areaToString(property.area_construida);
  assign(payload, "areaConstruida", areaConstruida);
  // Nome externo inconsistente preservado de propósito: `tipoareaConstruida`.
  if (areaConstruida) assign(payload, "tipoareaConstruida", textOrUndefined(codes.tipoAreaConstruida));

  const frente = areaToString(property.terreno_frente);
  assign(payload, "terrenoFrente", frente);
  if (frente) assign(payload, "tipoTerrenoFrente", textOrUndefined(codes.tipoTerrenoFrente));
  const fundo = areaToString(property.terreno_fundo);
  assign(payload, "terrenoFundo", fundo);
  if (fundo) assign(payload, "tipoTerrenoFundo", textOrUndefined(codes.tipoTerrenoFundo));
  const esquerda = areaToString(property.terreno_esquerda);
  assign(payload, "terrenoEsquerda", esquerda);
  if (esquerda) assign(payload, "tipoTerrenoEsquerda", textOrUndefined(codes.tipoTerrenoEsquerda));
  const direita = areaToString(property.terreno_direita);
  assign(payload, "terrenoDireita", direita);
  if (direita) assign(payload, "tipoTerrenoDireita", textOrUndefined(codes.tipoTerrenoDireita));

  // Composição
  assign(payload, "dormitorios", intToString(property.dormitorios));
  assign(payload, "suites", intToString(property.suites));
  assign(payload, "banheiros", intToString(property.banheiros));
  assign(payload, "salas", intToString(property.salas));
  assign(payload, "garagem", intToString(property.vagas));
  assign(payload, "acomodacoes", intToString(property.acomodacoes));
  assign(payload, "pavimento", textOrUndefined(property.pavimento));
  assign(payload, "anoConstrucao", textOrUndefined(property.ano_construcao));
  assign(payload, "mobiliado", flagToSimNao(property.mobiliado));

  // Conteúdo
  const descricao = sanitizeRichText(property.descricao_imovel);
  const split = descricao ? splitSanitizedForSites(descricao) : { head: "", overflow: "" };
  assign(payload, "descricaoImovel", split.head || undefined);
  // observacao_imovel e outras_informacoes são internos: nunca vão para os sites.
  // O que não coube na descrição continua aqui, também publicado no site.
  const pontosProprios = sanitizeRichText(property.pontos_fortes);
  const reserva = pontosProprios ? byteLength(pontosProprios) + 12 : 0;
  const overflow = split.overflow
    ? truncateSanitized(split.overflow, Math.max(200, IMOBI_DESCRICAO_MAX - reserva))
    : "";
  const pontosFortes = joinSanitized(overflow, pontosProprios);
  assign(
    payload,
    "pontosFortesImovel",
    pontosFortes ? truncateSanitized(pontosFortes) : undefined,
  );



  assign(payload, "video", textOrUndefined(property.video));
  assign(payload, "tourVirtual", textOrUndefined(property.tour_virtual));
  assign(payload, "tarjaImagem", textOrUndefined(property.tarja_imagem));
  assign(payload, "seoURL", textOrUndefined(property.seo_url));
  assign(payload, "seoTitulo", sanitizeRichText(property.seo_titulo));
  assign(payload, "seoDescricao", sanitizeRichText(property.seo_descricao));

  // Comercial — "Consulte" nunca vira 0.
  if (property.valor_modo !== "consulte") assign(payload, "valorImovel", moneyToString(property.valor));
  assign(payload, "valorIPTU", moneyToString(property.valor_iptu));
  assign(payload, "valorCondominio", moneyToString(property.valor_condominio));
  assign(payload, "valorTaxas", moneyToString(property.valor_taxas));
  assign(payload, "valorObservacao", sanitizeRichText(property.valor_observacao));

  // Divulgação e documentação
  assign(payload, "exibirImovel", boolToSimNao(property.exibir_imovel ?? true));
  assign(payload, "exibirCorretor", boolToSimNao(property.exibir_corretor));
  assign(payload, "destaqueInicial", boolToSimNao(property.destaque_inicial));
  assign(payload, "destaquesSuperDestaqueInicial", boolToSimNao(property.super_destaque_inicial));
  assign(payload, "disponibilizarExportacao", boolToSimNao(property.disponibilizar_exportacao));
  assign(payload, "emCondominio", boolToSimNao(property.em_condominio));
  assign(payload, "exclusividade", boolToSimNao(property.exclusividade));
  assign(payload, "autorizacao", boolToSimNao(property.autorizacao));
  assign(payload, "averbada", boolToSimNao(property.averbada));
  assign(payload, "escriturada", boolToSimNao(property.escriturada));
  assign(payload, "aceitaFinanciamento", boolToSimNao(property.aceita_financiamento));
  assign(payload, "comPlaca", boolToSimNao(property.com_placa));
  assign(payload, "permuta", boolToSimNao(property.permuta));
  assign(payload, "disponibilidade", textOrUndefined(property.disponibilidade));
  assign(payload, "localChave", textOrUndefined(property.local_chave));
  assign(payload, "origemCaptacao", textOrUndefined(property.origem_captacao));
  assign(payload, "dispararPeriodico", boolToSimNao(property.disparar_periodico));
  assign(payload, "portaisDivulgarConvencional", boolToSimNao(property.portais_convencional));
  assign(payload, "portaisDivulgarDestaque", boolToSimNao(property.portais_destaque));
  assign(payload, "portaisDivulgarSuperDestaque", boolToSimNao(property.portais_super_destaque));
  assign(payload, "portaisDivulgarSuperDestaque2", boolToSimNao(property.portais_super_destaque2));

  // Empreendimento / terreno — seções condicionais.
  if (property.tratar_empreendimento) {
    assign(payload, "tratarEmpreendimento", boolToSimNao(true));
    assign(payload, "nomeEmpreendimento", textOrUndefined(property.nome_empreendimento));
    assign(payload, "descricaoEmpreendimento", sanitizeRichText(property.descricao_empreendimento));
    assign(payload, "estagioEmpreendimento", textOrUndefined(property.estagio_empreendimento));
    assign(payload, "inicioPrevisaoEmpreendimento", textOrUndefined(property.inicio_previsao_empreendimento));
    assign(payload, "entregaPrevisaoEmpreendimento", textOrUndefined(property.entrega_previsao_empreendimento));
    assign(payload, "numeroTorre", textOrUndefined(property.numero_torre));
    assign(payload, "torreUnica", boolToSimNao(property.torre_unica));
  }
  assign(payload, "numeroAndar", textOrUndefined(property.numero_andar));
  assign(payload, "unidade", textOrUndefined(property.unidade));

  // `nomeCondominio` é tipado como integer no contrato apesar do nome:
  // só será enviado depois de um mapeamento administrativo confirmado.

  return payload;
}

/** Hash determinístico (FNV-1a) do payload normalizado — evita updates sem mudança real. */
export function hashPayload(payload: ImobiPayload): string {
  const normalized = JSON.stringify(
    Object.keys(payload)
      .sort()
      .map((key) => [key, payload[key]]),
  );
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
