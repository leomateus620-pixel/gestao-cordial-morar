/**
 * Contratos separados de INCLUSÃO e ALTERAÇÃO na ImobiBrasil.
 *
 * - Inclusão: corpo completo do cadastro (o site não tem nada ainda).
 * - Alteração: conjunto EXPLÍCITO de mudanças. Nunca uma cópia do formulário.
 *
 * Semântica confirmada em conta (`/api/v1/doc/api.json`):
 *   OMITIR PRESERVA · VAZIO LIMPA.
 *
 * Módulo puro, sem I/O — testável isoladamente.
 */

import { buildMinimalUpdate, REQUIRED_UPDATE_KEYS, sameValue, type PayloadSnapshot } from "./payload-diff";
import type { ImobiPayload } from "./serializers";

export type RemoteFieldSpec = {
  /** Chaves do corpo remoto afetadas por este campo local. */
  keys: string[];
  /** O campo aceita limpeza por envio vazio. */
  clearable: boolean;
  /** `0` é informação legítima (contagens), não ausência. */
  zeroIsValue?: boolean;
};

const NEVER_PUBLISHED: RemoteFieldSpec = { keys: [], clearable: false };

/**
 * Campo do Gestão -> campo(s) da API. Campos internos mapeiam para lista vazia:
 * jamais entram no corpo público, nem quando são editados.
 */
export const LOCAL_FIELD_MAP: Record<string, RemoteFieldSpec> = {
  // Identidade e classificação (nunca limpáveis: o contrato exige valor)
  operacao: { keys: ["finalidade"], clearable: false },
  finalidade: { keys: ["finalidade"], clearable: false },
  tipo: { keys: ["codigoTipoImovel"], clearable: false },
  referencia: { keys: ["referencia"], clearable: false },

  // Endereço
  cep: { keys: ["cep"], clearable: true },
  logradouro: { keys: ["logradouro"], clearable: true },
  numero: { keys: ["numero"], clearable: true },
  complemento: { keys: ["complemento"], clearable: true },
  bairro: { keys: ["bairro"], clearable: true },
  cidade: { keys: ["codigoCidade"], clearable: false },
  uf: { keys: ["codigoCidade"], clearable: false },
  zona: { keys: ["zona"], clearable: true },
  regiao: { keys: ["regiao"], clearable: true },
  exibirEnderecoSite: { keys: ["exibirEnderecoSite"], clearable: false },

  // Áreas
  areaPrincipal: { keys: ["areaPrivativa", "tipoAreaPrivativa"], clearable: true },
  areaUtil: { keys: ["areaPrivativa", "tipoAreaPrivativa"], clearable: true },
  areaTotal: { keys: ["areaTotal", "tipoAreaTotal"], clearable: true },
  areaConstruida: { keys: ["areaConstruida", "tipoareaConstruida"], clearable: true },
  areaTerreno: { keys: ["areaTerreno", "tipoAreaTerreno"], clearable: true },
  areaTipo: { keys: ["tipoAreaPrivativa"], clearable: false },

  // Composição — zero é informação
  dormitorios: { keys: ["dormitorios"], clearable: true, zeroIsValue: true },
  suites: { keys: ["suites"], clearable: true, zeroIsValue: true },
  banheiros: { keys: ["banheiros"], clearable: true, zeroIsValue: true },
  salas: { keys: ["salas"], clearable: true, zeroIsValue: true },
  vagas: { keys: ["garagem"], clearable: true, zeroIsValue: true },
  mobiliado: { keys: ["mobiliado"], clearable: false },

  // Comercial
  valor: { keys: ["valorImovel"], clearable: true },
  valorModo: { keys: ["valorImovel"], clearable: true },
  valorIptu: { keys: ["valorIPTU"], clearable: true },
  valorCondominio: { keys: ["valorCondominio"], clearable: true },
  valorTaxas: { keys: ["valorTaxas"], clearable: true },
  valorObservacao: { keys: ["valorObservacao"], clearable: true },
  aceitaFinanciamento: { keys: ["aceitaFinanciamento"], clearable: false },
  permuta: { keys: ["permuta"], clearable: false },

  // Conteúdo público — descrição e pontos fortes são uma operação só
  descricaoImovel: { keys: ["descricaoImovel", "pontosFortesImovel"], clearable: true },
  pontosFortes: { keys: ["pontosFortesImovel", "descricaoImovel"], clearable: true },
  video: { keys: ["video"], clearable: true },
  tourVirtual: { keys: ["tourVirtual"], clearable: true },

  // Divulgação e documentação
  exclusividade: { keys: ["exclusividade"], clearable: false },
  autorizacao: { keys: ["autorizacao"], clearable: false },
  escriturada: { keys: ["escriturada"], clearable: false },
  averbada: { keys: ["averbada"], clearable: false },
  comPlaca: { keys: ["comPlaca"], clearable: false },
  exibirImovel: { keys: ["exibirImovel"], clearable: false },
  destaqueInicial: { keys: ["destaqueInicial"], clearable: false },
  disponibilidade: { keys: ["disponibilidade"], clearable: true },
  origemCaptacao: { keys: ["origemCaptacao"], clearable: true },
  anoConstrucao: { keys: ["anoConstrucao"], clearable: true },
  pavimento: { keys: ["pavimento"], clearable: true },
  localChave: { keys: ["localChave"], clearable: true },
  unidade: { keys: ["unidade"], clearable: true },
  nomeEmpreendimento: { keys: ["nomeEmpreendimento"], clearable: true },

  // Internos e de pessoas — jamais no corpo público da alteração do imóvel
  observacaoImovel: NEVER_PUBLISHED,
  outrasInformacoes: NEVER_PUBLISHED,
  localizacaoMapsUrl: NEVER_PUBLISHED,
  localizacaoExibida: NEVER_PUBLISHED,
  proprietarioNome: NEVER_PUBLISHED,
  proprietarioTelefone: NEVER_PUBLISHED,
  proprietarioEmail: NEVER_PUBLISHED,
  corretorId: NEVER_PUBLISHED,
  corretorNome: NEVER_PUBLISHED,
  codigo: NEVER_PUBLISHED,
  codigoCordial: NEVER_PUBLISHED,
  codigoMorar: NEVER_PUBLISHED,
  carteira: NEVER_PUBLISHED,
};

/** `valor_iptu` -> `valorIptu`: aceita nome de coluna e nome de formulário. */
export function normalizeLocalField(name: string): string {
  if (!name.includes("_")) return name;
  return name.replace(/_([a-z0-9])/g, (_all, ch: string) => ch.toUpperCase());
}

export type UpdatePatch = {
  /** Corpo a enviar: obrigatórios + só o que mudou de fato. */
  payload: ImobiPayload;
  /** Chaves remotas realmente alteradas (fora dos obrigatórios). */
  changedKeys: string[];
  /** Chaves enviadas vazias de propósito (limpeza explícita). */
  clearedKeys: string[];
  /** Campos locais tocados sem correspondência publicável. */
  ignoredFields: string[];
};

export type BuildUpdatePatchInput = {
  /** Corpo completo serializado no modo `update`. */
  full: ImobiPayload;
  /** Último corpo confirmado no site (ou leitura remota normalizada). */
  snapshot: PayloadSnapshot | null | undefined;
  /** Campos locais que o usuário realmente tocou nesta edição. */
  changedFields?: string[] | null;
  /** Vínculos de pessoas com alteração explícita. */
  personLinkChanges?: string[];
};

/**
 * Monta a alteração. Com a lista de campos tocados, o corpo fica restrito a
 * eles (mais os obrigatórios) e a limpeza intencional é enviada vazia. Sem a
 * lista, cai na diferença contra o snapshot e NUNCA limpa nada por conta.
 */
export function buildUpdatePatch(input: BuildUpdatePatchInput): UpdatePatch {
  const { full, snapshot } = input;
  const base = buildMinimalUpdate(full, snapshot, {
    personLinkChanges: input.personLinkChanges ?? [],
  });

  const fields = (input.changedFields ?? []).map(normalizeLocalField).filter(Boolean);
  if (!fields.length) {
    return {
      payload: base.payload,
      changedKeys: base.changedKeys,
      clearedKeys: [],
      ignoredFields: [],
    };
  }

  const required = new Set<string>(REQUIRED_UPDATE_KEYS);
  const allowed = new Set<string>(required);
  const ignoredFields: string[] = [];
  const clearableKeys = new Set<string>();

  for (const field of fields) {
    const spec = LOCAL_FIELD_MAP[field];
    if (!spec) {
      ignoredFields.push(field);
      continue;
    }
    if (!spec.keys.length) {
      ignoredFields.push(field);
      continue;
    }
    for (const key of spec.keys) {
      allowed.add(key);
      if (spec.clearable) clearableKeys.add(key);
    }
  }

  const payload: ImobiPayload = {};
  const changedKeys: string[] = [];
  const clearedKeys: string[] = [];

  for (const key of allowed) {
    const value = full[key];
    if (value !== undefined) {
      payload[key] = value;
      if (required.has(key)) {
        if (snapshot && !sameValue(snapshot[key], value)) changedKeys.push(key);
      } else if (!snapshot || !sameValue(snapshot[key], value)) {
        changedKeys.push(key);
      }
      continue;
    }

    // Campo tocado ficou sem valor local: limpeza intencional. Só vale a escrita
    // se o site ainda tem conteúdo (ou se o estado remoto é desconhecido).
    if (!clearableKeys.has(key)) continue;
    const remote = snapshot ? snapshot[key] : undefined;
    if (snapshot && sameValue(remote, "")) continue;
    payload[key] = "";
    changedKeys.push(key);
    clearedKeys.push(key);
  }

  return { payload, changedKeys, clearedKeys, ignoredFields };
}

export function hasEffectivePatch(patch: UpdatePatch): boolean {
  return patch.changedKeys.length > 0;
}

/** Retirada do site: apenas identidade + o campo que esconde o anúncio. */
export function buildUnpublishPatch(full: ImobiPayload): ImobiPayload {
  const payload: ImobiPayload = {};
  for (const key of REQUIRED_UPDATE_KEYS) {
    if (full[key] !== undefined) payload[key] = full[key];
  }
  payload["exibirImovel"] = "nao";
  return payload;
}
