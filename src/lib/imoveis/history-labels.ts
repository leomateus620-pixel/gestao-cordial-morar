/** Rótulos e formatação da linha do tempo do imóvel (puro, sem servidor). */
export type HistoryChange = { field: string; from?: unknown; to?: unknown; sensitive?: boolean };

export const HISTORY_CATEGORY_LABEL: Record<string, string> = {
  criacao: "Cadastro",
  caracteristicas: "Características",
  valores: "Valores",
  endereco: "Endereço",
  descricao: "Descrição",
  operacao: "Operação e exibição",
  documentacao: "Documentação",
  codigos: "Códigos",
  publicacao: "Publicação",
  corretor: "Corretor",
  dados_privados: "Dados privados",
  arquivamento: "Arquivamento",
  fotos: "Fotos",
  videos: "Vídeos",
};

const FIELD_LABEL: Record<string, string> = {
  tipo: "Tipo", dormitorios: "Dormitórios", suites: "Suítes", banheiros: "Banheiros", vagas: "Vagas",
  salas: "Salas", acomodacoes: "Acomodações", area_principal: "Área principal", area_tipo: "Tipo de área",
  area_total: "Área total", area_util: "Área útil", area_construida: "Área construída", area_terreno: "Área do terreno",
  area_privativa: "Área privativa", terreno_frente: "Frente", terreno_fundo: "Fundos", terreno_esquerda: "Lateral esquerda",
  terreno_direita: "Lateral direita", pavimento: "Pavimento", numero_andar: "Andar", mobiliado: "Mobiliado",
  ano_construcao: "Ano de construção", caracteristicas: "Características", em_condominio: "Em condomínio",
  nome_condominio: "Condomínio", valor: "Valor", valor_modo: "Modo do valor", valor_exibido: "Valor exibido",
  valor_iptu: "IPTU", valor_condominio: "Condomínio (R$)", valor_taxas: "Taxas", aceita_financiamento: "Aceita financiamento",
  permuta: "Permuta", cep: "CEP", logradouro: "Rua", numero: "Número", complemento: "Complemento", bairro: "Bairro",
  cidade: "Cidade", uf: "UF", zona: "Zona", regiao: "Região", ponto_referencia: "Ponto de referência",
  exibir_endereco_site: "Exibir endereço no site", localizacao_exibida: "Localização exibida",
  localizacao_maps_url: "Link do Maps", descricao_imovel: "Descrição", pontos_fortes: "Pontos fortes",
  nome_empreendimento: "Empreendimento", unidade: "Unidade", video: "Vídeo (link)", tour_virtual: "Tour virtual",
  seo_titulo: "Título SEO", seo_descricao: "Descrição SEO", carteira: "Carteira", operacao: "Operação",
  finalidade: "Finalidade", disponibilidade: "Disponibilidade", exibir_imovel: "Exibir imóvel",
  destaque_inicial: "Destaque", super_destaque_inicial: "Super destaque", exclusividade: "Exclusividade",
  autorizacao: "Autorização", escriturada: "Escriturada", averbada: "Averbada", com_placa: "Com placa",
  codigo: "Código interno", codigo_cordial: "Código Cordial", codigo_morar: "Código Morar", referencia: "Referência",
  publish_targets: "Sites", corretor_nome: "Corretor", origem_captacao: "Origem da captação",
  proprietario_nome: "Proprietário", proprietario_telefone: "Telefone do proprietário",
  proprietario_email: "E-mail do proprietário", valor_observacao: "Observação do valor",
  observacao_imovel: "Observações internas", outras_informacoes: "Outras informações", local_chave: "Local da chave",
  removal_state: "Situação", status_cordial: "Site Cordial", status_morar: "Site Morar",
  fotos_adicionadas: "Fotos adicionadas", fotos_removidas: "Fotos removidas", fotos_reordenadas: "Fotos reposicionadas",
  fotos_substituidas: "Fotos substituídas",
};

const MONEY = new Set(["valor", "valor_iptu", "valor_condominio", "valor_taxas"]);
const AREA = new Set(["area_principal", "area_total", "area_util", "area_construida", "area_terreno", "area_privativa"]);
const ENUM: Record<string, string> = {
  venda: "Venda", aluguel: "Aluguel", locacao: "Locação", temporada: "Temporada", cordial: "Cordial", morar: "Morar",
  fixo: "Valor fixo", consulte: "Consulte", sim: "Sim", nao: "Não", archived: "Arquivado",
  pending_archive: "Arquivando", active: "Ativo", published: "Publicado", unpublished: "Retirado", error: "Erro",
  conflict: "Conflito de código", pending: "Pendente", syncing: "Enviando", draft: "Rascunho", partial: "Parcial",
};

export function historyFieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field.replace(/_/g, " ");
}

export function formatHistoryValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "vazio";
  if (Array.isArray(value)) {
    if (!value.length) return "vazio";
    return value.map((v) => formatHistoryValue(field, v)).join(", ");
  }
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number" || (typeof value === "string" && MONEY.has(field) && value.trim() !== "")) {
    const n = Number(value);
    if (Number.isFinite(n)) {
      if (MONEY.has(field)) return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      if (AREA.has(field)) return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
      return n.toLocaleString("pt-BR");
    }
  }
  const s = String(value);
  if (ENUM[s]) return ENUM[s];
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

/** Linha legível "Campo: antes → depois". Sem valores quando o dado é privado e oculto. */
export function describeHistoryChange(c: HistoryChange): string {
  const label = historyFieldLabel(c.field);
  if (c.sensitive && !("from" in c) && !("to" in c)) return `${label}: alterado`;
  if (c.field.startsWith("fotos_")) return `${label}: ${formatHistoryValue(c.field, c.to)}`;
  return `${label}: ${formatHistoryValue(c.field, c.from)} → ${formatHistoryValue(c.field, c.to)}`;
}

/** Data e hora em Brasília: "23/10/2026 às 10:50". */
export function formatHistoryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}
