import edificioHarmonia from "@/assets/properties/edificio-harmonia.jpg";
import aptoJardins from "@/assets/properties/apto-jardins.jpg";
import casaBraganca from "@/assets/properties/casa-braganca.jpg";
import loftVilaMadalena from "@/assets/properties/loft-vila-madalena.jpg";
import coberturaItaim from "@/assets/properties/cobertura-itaim.jpg";
import casaVilaNova from "@/assets/properties/casa-vila-nova.jpg";
import type { Client } from "@/types/client";
import type { Corretor } from "@/types/corretor";
import type { Agenciamento } from "@/types/agenciamento";
import type {
  MarketingCampaign,
  MarketingDailyMetric,
  MarketingLocationBreakdown,
} from "@/types/marketing";

export type { Corretor } from "@/types/corretor";
export type { Agenciamento } from "@/types/agenciamento";
export type { MarketingCampaign } from "@/types/marketing";

export type AgencyId = "cordial" | "morar";

export const agencies = [
  { id: "cordial" as const, nome: "Cordial Imóveis", cor: "var(--cordial)" },
  { id: "morar" as const, nome: "Morar Imóveis", cor: "var(--morar)" },
];

export type OrigemLead =
  | "WhatsApp"
  | "Instagram"
  | "Facebook Ads"
  | "Google Ads"
  | "Indicação"
  | "Placa"
  | "Portal imobiliário"
  | "Site"
  | "Captação ativa"
  | "Carteira antiga"
  | "Porta fria";

export type DocumentoStatus =
  "Pendente" | "Recebido" | "Em análise" | "Aprovado" | "Reprovado" | "Vencido";
export type ImovelTipo =
  "Apartamento" | "Casa" | "Cobertura" | "Loft" | "Terreno" | "Sala comercial" | "Sítio";
export type ImovelFinalidade = "Venda" | "Aluguel" | "Ambos";
export type ImovelStatus =
  | "Captação"
  | "Disponível"
  | "Reservado"
  | "Em negociação"
  | "Vendido"
  | "Alugado"
  | "Inativo"
  | "Suspenso";
export type AtendimentoStatus =
  | "Novo"
  | "Aberto"
  | "Em atendimento"
  | "Em visita"
  | "Proposta"
  | "Fechado"
  | "Perdido"
  | "Pausado";

export const corretoresSeed: Corretor[] = [
  {
    id: "c1",
    nome: "Marcos Lima",
    iniciais: "ML",
    imobiliaria: "cordial",
    creci: "CRECI-RS 123456",
    status: "ativo",
    atendimentosMes: 18,
    atendimentosRecebidos: 18,
    atendimentosEmAndamento: 7,
    visitasRealizadas: 11,
    propostasFeitas: 7,
    contratosFechados: 4,
    vendasFechadas: 2,
    alugueisFechados: 2,
    agenciamentosFeitos: 7,
    agenciamentosComPlaca: 4,
    agenciamentosComFotos: 7,
    agenciamentosNoSite: 5,
    agenciamentosValidados: 4,
    comissaoPrevista: 14600,
    comissaoPaga: 9800,
    comissaoMes: 12400,
    taxaConversao: 22,
    mediaMensalContratos: 3.8,
    ticketMedio: 3650,
    performanceTrend: "estavel",
    ultimoAtendimentoEm: "2026-06-18T16:30:00.000Z",
    observacaoGestao:
      "Carteira equilibrada entre venda e locação; bom ritmo de retorno pós-visita.",
  },
  {
    id: "c2",
    nome: "Paula Souza",
    iniciais: "PS",
    imobiliaria: "cordial",
    creci: "CRECI-RS 234567",
    status: "ativo",
    atendimentosMes: 22,
    atendimentosRecebidos: 22,
    atendimentosEmAndamento: 8,
    visitasRealizadas: 15,
    propostasFeitas: 9,
    contratosFechados: 6,
    vendasFechadas: 3,
    alugueisFechados: 3,
    agenciamentosFeitos: 9,
    agenciamentosComPlaca: 6,
    agenciamentosComFotos: 9,
    agenciamentosNoSite: 7,
    agenciamentosValidados: 5,
    comissaoPrevista: 21400,
    comissaoPaga: 15600,
    comissaoMes: 18900,
    taxaConversao: 27,
    mediaMensalContratos: 5.4,
    ticketMedio: 3567,
    performanceTrend: "alta",
    ultimoAtendimentoEm: "2026-06-19T11:45:00.000Z",
    observacaoGestao: "Melhor conversão do período e forte disciplina em propostas qualificadas.",
  },
  {
    id: "c3",
    nome: "Felipe Andrade",
    iniciais: "FA",
    imobiliaria: "morar",
    creci: "CRECI-RS 345678",
    status: "ativo",
    atendimentosMes: 14,
    atendimentosRecebidos: 14,
    atendimentosEmAndamento: 6,
    visitasRealizadas: 8,
    propostasFeitas: 5,
    contratosFechados: 3,
    vendasFechadas: 1,
    alugueisFechados: 2,
    agenciamentosFeitos: 8,
    agenciamentosComPlaca: 4,
    agenciamentosComFotos: 8,
    agenciamentosNoSite: 6,
    agenciamentosValidados: 3,
    comissaoPrevista: 10750,
    comissaoPaga: 7200,
    comissaoMes: 9200,
    taxaConversao: 21,
    mediaMensalContratos: 3.1,
    ticketMedio: 3583,
    performanceTrend: "estavel",
    ultimoAtendimentoEm: "2026-06-17T14:20:00.000Z",
    observacaoGestao:
      "Boa constância em locações; próximo ganho está em acelerar cadastros no site.",
  },
  {
    id: "c4",
    nome: "Camila Reis",
    iniciais: "CR",
    imobiliaria: "morar",
    creci: "CRECI-RS 456789",
    status: "ativo",
    atendimentosMes: 19,
    atendimentosRecebidos: 19,
    atendimentosEmAndamento: 9,
    visitasRealizadas: 13,
    propostasFeitas: 8,
    contratosFechados: 5,
    vendasFechadas: 2,
    alugueisFechados: 3,
    agenciamentosFeitos: 6,
    agenciamentosComPlaca: 3,
    agenciamentosComFotos: 6,
    agenciamentosNoSite: 5,
    agenciamentosValidados: 4,
    comissaoPrevista: 16800,
    comissaoPaga: 11800,
    comissaoMes: 14800,
    taxaConversao: 26,
    mediaMensalContratos: 4.6,
    ticketMedio: 3360,
    performanceTrend: "alta",
    ultimoAtendimentoEm: "2026-06-18T09:10:00.000Z",
    observacaoGestao: "Destaque em visitas e bom equilíbrio entre contratos de venda e aluguel.",
  },
  {
    id: "c5",
    nome: "Rafael Duarte",
    iniciais: "RD",
    imobiliaria: "ambas",
    creci: "CRECI-RS 567890",
    status: "inativo",
    atendimentosMes: 6,
    atendimentosRecebidos: 6,
    atendimentosEmAndamento: 1,
    visitasRealizadas: 3,
    propostasFeitas: 2,
    contratosFechados: 1,
    vendasFechadas: 0,
    alugueisFechados: 1,
    agenciamentosFeitos: 3,
    agenciamentosComPlaca: 1,
    agenciamentosComFotos: 2,
    agenciamentosNoSite: 1,
    agenciamentosValidados: 1,
    comissaoPrevista: 4200,
    comissaoPaga: 4200,
    comissaoMes: 4200,
    taxaConversao: 17,
    mediaMensalContratos: 1.2,
    ticketMedio: 4200,
    performanceTrend: "queda",
    ultimoAtendimentoEm: "2026-05-28T10:00:00.000Z",
    observacaoGestao:
      "Mantido no histórico para leitura gerencial; sem operação ativa neste período.",
  },
];

export type ClienteHistorico = {
  data: string;
  tipo: "Ligação" | "WhatsApp" | "Visita" | "Proposta" | "E-mail" | "Contrato" | "Observação";
  descricao: string;
  responsavelId: string;
};

export type ClienteDocumento = {
  id: string;
  nome: string;
  status: DocumentoStatus;
  vencimento?: string;
};

export type ClienteLembrete = {
  id: string;
  data: string;
  titulo: string;
  concluido: boolean;
};

export type ClienteTimeline = {
  data: string;
  etapa: string;
  detalhe: string;
};

export type Cliente = {
  id: string;
  nome: string;
  iniciais: string;
  telefone: string;
  whatsapp?: string;
  email: string;
  tipo: "Comprador" | "Locatário" | "Vendedor" | "Proprietário";
  interesse: string;
  orcamento: number;
  perfilBusca?: string;
  origem?: OrigemLead;
  faixaValor?: { minimo: number; maximo: number };
  bairros?: string[];
  historico?: ClienteHistorico[];
  documentos?: ClienteDocumento[];
  lembretes?: ClienteLembrete[];
  timeline?: ClienteTimeline[];
  imobiliaria: AgencyId;
  criadoEm: string;
  documento?: string;
  rendaMensal?: number;
  preferenciaContato?: "WhatsApp" | "Telefone" | "E-mail";
  observacoes?: string;
} & Partial<Client>;

export const clientesSeed: Cliente[] = [];

export type ImovelDocumento = {
  id: string;
  nome: string;
  status: DocumentoStatus;
  validade?: string;
};

export type Imovel = {
  id: string;
  codigoInterno?: string;
  titulo: string;
  endereco: string;
  bairro: string;
  cidade: string;
  tipo: ImovelTipo;
  finalidade: ImovelFinalidade;
  valor: number;
  valorVenda?: number;
  valorAluguel?: number;
  condominio?: number;
  iptu?: number;
  quartos: number;
  dormitorios?: number;
  banheiros?: number;
  vagas?: number;
  area: number;
  areaPrivativa?: number;
  areaTotal?: number;
  proprietario?: { id: string; nome: string; telefone: string };
  corretorId?: string;
  status: ImovelStatus;
  documentos?: ImovelDocumento[];
  origemCaptacao?: OrigemLead;
  imobiliaria: AgencyId;
  foto: string;
  fotos?: string[];
  suites?: number;
  proprietarioId?: string;
  descricao?: string;
};

export const imoveisSeed: Imovel[] = [
  {
    id: "im1",
    codigoInterno: "CRD-SR-0001",
    titulo: "Residencial Harmonia Centro",
    endereco: "Rua Buenos Aires, 1200",
    bairro: "Centro",
    cidade: "Santa Rosa/RS",
    tipo: "Apartamento",
    finalidade: "Venda",
    valor: 520000,
    valorVenda: 520000,
    valorAluguel: 0,
    condominio: 430,
    iptu: 1180,
    quartos: 3,
    dormitorios: 3,
    banheiros: 2,
    vagas: 1,
    area: 142,
    areaPrivativa: 118,
    areaTotal: 142,
    proprietario: { id: "cl4", nome: "Ricardo Tavares", telefone: "(55) 96666-5555" },
    corretorId: "c1",
    status: "Disponível",
    documentos: [
      { id: "doc-im1-1", nome: "Matrícula", status: "Aprovado", validade: "2026-08-20" },
      { id: "doc-im1-2", nome: "Habite-se", status: "Recebido" },
    ],
    origemCaptacao: "Carteira antiga",
    imobiliaria: "cordial",
    foto: edificioHarmonia,
  },
  {
    id: "im2",
    codigoInterno: "CRD-SR-0002",
    titulo: "Apartamento Cruzeiro Vista",
    endereco: "Rua Santa Cruz, 450",
    bairro: "Cruzeiro",
    cidade: "Santa Rosa/RS",
    tipo: "Apartamento",
    finalidade: "Venda",
    valor: 430000,
    valorVenda: 430000,
    valorAluguel: 0,
    condominio: 360,
    iptu: 920,
    quartos: 2,
    dormitorios: 2,
    banheiros: 2,
    vagas: 1,
    area: 98,
    areaPrivativa: 82,
    areaTotal: 98,
    proprietario: { id: "prop-2", nome: "Sônia Martins", telefone: "(55) 99920-7788" },
    corretorId: "c2",
    status: "Vendido",
    documentos: [{ id: "doc-im2-1", nome: "Contrato de compra e venda", status: "Aprovado" }],
    origemCaptacao: "Indicação",
    imobiliaria: "cordial",
    foto: aptoJardins,
  },
  {
    id: "im3",
    codigoInterno: "MOR-SR-0014",
    titulo: "Casa com Pátio na Sulina",
    endereco: "Rua das Palmeiras, 88",
    bairro: "Sulina",
    cidade: "Santa Rosa/RS",
    tipo: "Casa",
    finalidade: "Venda",
    valor: 780000,
    valorVenda: 780000,
    valorAluguel: 0,
    condominio: 0,
    iptu: 1450,
    quartos: 4,
    dormitorios: 4,
    banheiros: 3,
    vagas: 2,
    area: 320,
    areaPrivativa: 230,
    areaTotal: 520,
    proprietario: { id: "prop-3", nome: "Alberto Costa", telefone: "(55) 99811-2200" },
    corretorId: "c3",
    status: "Reservado",
    documentos: [
      { id: "doc-im3-1", nome: "Matrícula", status: "Recebido" },
      { id: "doc-im3-2", nome: "Certidões negativas", status: "Pendente" },
    ],
    origemCaptacao: "Captação ativa",
    imobiliaria: "morar",
    foto: casaBraganca,
  },
  {
    id: "im4",
    codigoInterno: "CRD-SR-0007",
    titulo: "Loft Planalto Compacto",
    endereco: "Rua Harmonia, 320",
    bairro: "Planalto",
    cidade: "Santa Rosa/RS",
    tipo: "Loft",
    finalidade: "Aluguel",
    valor: 1200,
    valorVenda: 0,
    valorAluguel: 1200,
    condominio: 180,
    iptu: 55,
    quartos: 1,
    dormitorios: 1,
    banheiros: 1,
    vagas: 0,
    area: 42,
    areaPrivativa: 36,
    areaTotal: 42,
    proprietario: { id: "prop-4", nome: "Cláudia Nunes", telefone: "(55) 99777-4141" },
    corretorId: "c2",
    status: "Disponível",
    documentos: [{ id: "doc-im4-1", nome: "Laudo de vistoria", status: "Em análise" }],
    origemCaptacao: "Placa",
    imobiliaria: "cordial",
    foto: loftVilaMadalena,
  },
  {
    id: "im5",
    codigoInterno: "MOR-SR-0009",
    titulo: "Cobertura Centro Próxima à Praça",
    endereco: "Rua Horizontina, 760",
    bairro: "Centro",
    cidade: "Santa Rosa/RS",
    tipo: "Cobertura",
    finalidade: "Ambos",
    valor: 800000,
    valorVenda: 800000,
    valorAluguel: 0,
    condominio: 680,
    iptu: 1900,
    quartos: 4,
    dormitorios: 4,
    banheiros: 4,
    vagas: 2,
    area: 280,
    areaPrivativa: 210,
    areaTotal: 280,
    proprietario: { id: "cl4", nome: "Ricardo Tavares", telefone: "(55) 96666-5555" },
    corretorId: "c4",
    status: "Captação",
    documentos: [{ id: "doc-im5-1", nome: "Autorização de venda", status: "Pendente" }],
    origemCaptacao: "Carteira antiga",
    imobiliaria: "morar",
    foto: coberturaItaim,
  },
  {
    id: "im6",
    titulo: "Casa Vila Nova",
    endereco: "Rua das Hortênsias, 145",
    bairro: "Vila Nova",
    cidade: "São Paulo",
    tipo: "Casa",
    finalidade: "Aluguel",
    valor: 9800,
    quartos: 3,
    area: 220,
    status: "Disponível",
    imobiliaria: "morar",
    foto: casaVilaNova,
  },
  {
    id: "im7",
    codigoInterno: "CRD-SR-0011",
    titulo: "Apartamento Timbaúva Econômico",
    endereco: "Rua Tuparendi, 62",
    bairro: "Timbaúva",
    cidade: "Santa Rosa/RS",
    tipo: "Apartamento",
    finalidade: "Aluguel",
    valor: 1000,
    valorVenda: 0,
    valorAluguel: 1000,
    condominio: 150,
    iptu: 45,
    quartos: 2,
    dormitorios: 2,
    banheiros: 1,
    vagas: 1,
    area: 58,
    areaPrivativa: 52,
    areaTotal: 58,
    proprietario: { id: "prop-7", nome: "Paulo Feiten", telefone: "(55) 99555-1212" },
    corretorId: "c1",
    status: "Disponível",
    documentos: [{ id: "doc-im7-1", nome: "Autorização de locação", status: "Recebido" }],
    origemCaptacao: "Site",
    imobiliaria: "cordial",
    foto: aptoJardins,
  },
  {
    id: "im8",
    codigoInterno: "MOR-SR-0018",
    titulo: "Terreno nos Arredores da Auxiliadora",
    endereco: "Estrada Linha 15, km 3",
    bairro: "Auxiliadora",
    cidade: "Santa Rosa/RS",
    tipo: "Terreno",
    finalidade: "Venda",
    valor: 300000,
    valorVenda: 300000,
    valorAluguel: 0,
    condominio: 0,
    iptu: 640,
    quartos: 0,
    dormitorios: 0,
    banheiros: 0,
    vagas: 0,
    area: 600,
    areaPrivativa: 600,
    areaTotal: 600,
    proprietario: { id: "prop-8", nome: "Rural Empreendimentos", telefone: "(55) 99901-0001" },
    corretorId: "c3",
    status: "Disponível",
    documentos: [{ id: "doc-im8-1", nome: "Matrícula rural", status: "Em análise" }],
    origemCaptacao: "Captação ativa",
    imobiliaria: "morar",
    foto: casaBraganca,
  },
];

export type AtendimentoHistorico = {
  data: string;
  descricao: string;
  responsavelId: string;
};

export type Atendimento = {
  id: string;
  clienteId: string;
  imovelId: string;
  corretorId: string;
  telefone?: string;
  whatsapp?: string;
  origem?: OrigemLead;
  data?: string;
  imobiliaria: AgencyId;
  responsavel?: string;
  interesse?: "Comprar" | "Alugar" | "Vender" | "Anunciar" | "Avaliar";
  tipoImovel?: ImovelTipo;
  faixaValor?: { minimo: number; maximo: number };
  bairro?: string;
  dormitorios?: number;
  garagem?: boolean;
  patio?: boolean;
  salaComercial?: boolean;
  apartamento?: boolean;
  casa?: boolean;
  terreno?: boolean;
  urgencia?: "Baixa" | "Média" | "Alta" | "Imediata";
  status: AtendimentoStatus;
  historico?: AtendimentoHistorico[];
  motivoPerda?: string;
  observacoes: string;
  criadoEm: string;
  prioridade?: "Baixa" | "Média" | "Alta";
  proximoRetorno?: string;
};

export const atendimentosSeed: Atendimento[] = [];

export type Contrato = {
  id: string;
  numero: string;
  tipo: "Venda" | "Aluguel";
  clienteId: string;
  imovelId: string;
  corretorId: string;
  imobiliaria: AgencyId;
  valor: number;
  inicio: string;
  fim: string;
  status: "Ativo" | "Pendente assinatura" | "Encerrado";
  proprietarioId?: string;
  documentos?: string[];
  historico?: string[];
  comissaoPercentual?: number;
  sinal?: number;
  diaVencimento?: number;
};

export const contratosSeed: Contrato[] = [
  {
    id: "ct1",
    numero: "CRD-2026-001",
    tipo: "Venda",
    clienteId: "cl1",
    imovelId: "im2",
    corretorId: "c2",
    imobiliaria: "cordial",
    valor: 430000,
    inicio: "2026-06-09",
    fim: "2026-06-09",
    status: "Ativo",
  },
  {
    id: "ct2",
    numero: "MOR-2026-014",
    tipo: "Aluguel",
    clienteId: "cl5",
    imovelId: "im6",
    corretorId: "c4",
    imobiliaria: "morar",
    valor: 1250,
    inicio: "2026-06-01",
    fim: "2027-06-01",
    status: "Ativo",
  },
  {
    id: "ct3",
    numero: "CRD-2026-002",
    tipo: "Aluguel",
    clienteId: "cl2",
    imovelId: "im4",
    corretorId: "c2",
    imobiliaria: "cordial",
    valor: 1200,
    inicio: "2026-06-15",
    fim: "2027-06-15",
    status: "Pendente assinatura",
  },
  {
    id: "ct4",
    numero: "MOR-2026-009",
    tipo: "Venda",
    clienteId: "cl3",
    imovelId: "im3",
    corretorId: "c3",
    imobiliaria: "morar",
    valor: 780000,
    inicio: "2026-05-20",
    fim: "2026-05-20",
    status: "Pendente assinatura",
  },
];

export type Compromisso = {
  id: string;
  titulo: string;
  tipo: "Visita" | "Reunião" | "Vistoria" | "Assinatura";
  data: string;
  duracaoMin: number;
  clienteId?: string;
  imovelId?: string;
  corretorId: string;
  imobiliaria: AgencyId;
  local?: string;
  status?: "Agendado" | "Confirmado" | "Concluído" | "Cancelado";
  observacoes?: string;
};

export const agendaSeed: Compromisso[] = [
  {
    id: "ag1",
    titulo: "Visita Residencial Harmonia Centro",
    tipo: "Visita",
    data: "2026-06-13T10:00:00",
    duracaoMin: 60,
    clienteId: "cl1",
    imovelId: "im1",
    corretorId: "c1",
    imobiliaria: "cordial",
  },
  {
    id: "ag2",
    titulo: "Reunião proposta João Pedro",
    tipo: "Reunião",
    data: "2026-06-12T14:30:00",
    duracaoMin: 45,
    clienteId: "cl2",
    imovelId: "im4",
    corretorId: "c2",
    imobiliaria: "cordial",
  },
  {
    id: "ag3",
    titulo: "Vistoria Casa Bragança",
    tipo: "Vistoria",
    data: "2026-06-12T09:00:00",
    duracaoMin: 90,
    clienteId: "cl3",
    imovelId: "im3",
    corretorId: "c3",
    imobiliaria: "morar",
  },
  {
    id: "ag4",
    titulo: "Assinatura contrato MOR-2026-014",
    tipo: "Assinatura",
    data: "2026-06-11T17:00:00",
    duracaoMin: 30,
    clienteId: "cl5",
    imovelId: "im6",
    corretorId: "c4",
    imobiliaria: "morar",
  },
  {
    id: "ag5",
    titulo: "Fotografia cobertura Centro",
    tipo: "Visita",
    data: "2026-06-14T15:00:00",
    duracaoMin: 60,
    clienteId: "cl4",
    imovelId: "im5",
    corretorId: "c4",
    imobiliaria: "morar",
  },
];

export type Lancamento = {
  id: string;
  descricao: string;
  categoria: string;
  valor: number;
  data: string;
  tipo: "entrada" | "saida";
  imobiliaria: AgencyId | "ambas";
  status: "Pago" | "Pendente" | "Atrasado" | "Cancelado";
};

export const lancamentosSeed: Lancamento[] = [
  {
    id: "l1",
    descricao: "Comissão venda Apartamento Cruzeiro Vista",
    categoria: "Comissão",
    valor: 21500,
    data: "2026-06-09",
    tipo: "entrada",
    imobiliaria: "cordial",
    status: "Pago",
  },
  {
    id: "l2",
    descricao: "Aluguel recebido — Loft Planalto Compacto",
    categoria: "Aluguel recebido",
    valor: 1200,
    data: "2026-06-05",
    tipo: "entrada",
    imobiliaria: "cordial",
    status: "Pago",
  },
  {
    id: "l3",
    descricao: "Repasse proprietário — Casa Glória",
    categoria: "Repasse",
    valor: 1125,
    data: "2026-06-07",
    tipo: "saida",
    imobiliaria: "morar",
    status: "Pago",
  },
  {
    id: "l4",
    descricao: "Comissão aluguel Casa Glória",
    categoria: "Comissão",
    valor: 1250,
    data: "2026-06-01",
    tipo: "entrada",
    imobiliaria: "morar",
    status: "Pago",
  },
  {
    id: "l5",
    descricao: "Aluguel — Apartamento Timbaúva Econômico",
    categoria: "Aluguel recebido",
    valor: 1000,
    data: "2026-06-10",
    tipo: "entrada",
    imobiliaria: "cordial",
    status: "Pendente",
  },
  {
    id: "l6",
    descricao: "Aluguel — Sala Comercial Faria Lima",
    categoria: "Aluguel recebido",
    valor: 12000,
    data: "2026-05-28",
    tipo: "entrada",
    imobiliaria: "morar",
    status: "Atrasado",
  },
];

export const receitaMensal = [
  { mes: "Jan", vendas: 28, alugueis: 14 },
  { mes: "Fev", vendas: 35, alugueis: 18 },
  { mes: "Mar", vendas: 22, alugueis: 16 },
  { mes: "Abr", vendas: 48, alugueis: 22 },
  { mes: "Mai", vendas: 62, alugueis: 24 },
  { mes: "Jun", vendas: 84, alugueis: 28 },
];
export type CampanhaMarketing = MarketingCampaign;

type MarketingCampaignSeedInput = Omit<
  MarketingCampaign,
  | "leads"
  | "clicks"
  | "accesses"
  | "views"
  | "impressions"
  | "conversionRate"
  | "costPerLead"
  | "bestLocation"
>;

function buildMarketingCampaign(input: MarketingCampaignSeedInput): MarketingCampaign {
  const leads = sumMarketingDaily(input.dailyMetrics, "leads");
  const clicks = sumMarketingDaily(input.dailyMetrics, "clicks");
  const accesses = sumMarketingDaily(input.dailyMetrics, "accesses");
  const views = sumMarketingDaily(input.dailyMetrics, "views");
  const impressions = input.locationBreakdown.reduce(
    (total, location) => total + location.impressions,
    0,
  );
  const bestLocation =
    [...input.locationBreakdown].sort((a, b) => b.impressions - a.impressions)[0]?.location ??
    "Não informado";

  return {
    ...input,
    leads,
    clicks,
    accesses,
    views,
    impressions,
    bestLocation,
    costPerLead: leads > 0 ? roundMarketingMetric(input.investment / leads) : 0,
    conversionRate: accesses > 0 ? roundMarketingMetric((leads / accesses) * 100) : 0,
  };
}

function sumMarketingDaily(
  metrics: MarketingDailyMetric[],
  key: keyof Omit<MarketingDailyMetric, "date">,
) {
  return metrics.reduce((total, item) => total + item[key], 0);
}

function roundMarketingMetric(value: number) {
  return Math.round(value * 100) / 100;
}

const marketingLocations = {
  jardins: [
    { location: "Jardins", impressions: 8200, clicks: 610, leads: 26 },
    { location: "Centro", impressions: 5200, clicks: 360, leads: 14 },
    { location: "São Paulo", impressions: 3900, clicks: 260, leads: 10 },
    { location: "Sulina", impressions: 3700, clicks: 290, leads: 12 },
  ],
  centro: [
    { location: "Centro", impressions: 9100, clicks: 770, leads: 33 },
    { location: "Santa Rosa/RS", impressions: 6200, clicks: 510, leads: 25 },
    { location: "Cruzeiro", impressions: 3900, clicks: 340, leads: 17 },
    { location: "Timbaúva", impressions: 2900, clicks: 280, leads: 13 },
  ],
  whatsapp: [
    { location: "Sulina", impressions: 880, clicks: 160, leads: 11 },
    { location: "Centro", impressions: 620, clicks: 120, leads: 9 },
    { location: "Timbaúva", impressions: 450, clicks: 90, leads: 5 },
    { location: "Jardins", impressions: 340, clicks: 60, leads: 4 },
  ],
  openHouse: [
    { location: "Jardins", impressions: 2800, clicks: 310, leads: 19 },
    { location: "Centro", impressions: 1800, clicks: 190, leads: 11 },
    { location: "São Paulo", impressions: 1200, clicks: 140, leads: 7 },
    { location: "Sulina", impressions: 900, clicks: 120, leads: 5 },
  ],
  facebook: [
    { location: "Cruzeiro", impressions: 6000, clicks: 370, leads: 7 },
    { location: "Centro", impressions: 4300, clicks: 270, leads: 5 },
    { location: "Sulina", impressions: 3100, clicks: 210, leads: 4 },
    { location: "Timbaúva", impressions: 2500, clicks: 130, leads: 3 },
  ],
  locacao: [
    { location: "Timbaúva", impressions: 1600, clicks: 130, leads: 7 },
    { location: "Centro", impressions: 1100, clicks: 100, leads: 5 },
    { location: "Cruzeiro", impressions: 800, clicks: 80, leads: 3 },
    { location: "Sulina", impressions: 650, clicks: 50, leads: 2 },
  ],
  portal: [
    { location: "Santa Rosa/RS", impressions: 4800, clicks: 440, leads: 23 },
    { location: "Centro", impressions: 3400, clicks: 310, leads: 15 },
    { location: "Cruzeiro", impressions: 2600, clicks: 220, leads: 10 },
    { location: "Jardins", impressions: 1800, clicks: 150, leads: 8 },
  ],
  local: [
    { location: "Sulina", impressions: 320, clicks: 70, leads: 9 },
    { location: "Timbaúva", impressions: 250, clicks: 50, leads: 6 },
    { location: "Centro", impressions: 210, clicks: 35, leads: 4 },
    { location: "Cruzeiro", impressions: 150, clicks: 25, leads: 2 },
  ],
  planejada: [
    { location: "São Paulo", impressions: 0, clicks: 0, leads: 0 },
    { location: "Jardins", impressions: 0, clicks: 0, leads: 0 },
  ],
} satisfies Record<string, MarketingLocationBreakdown[]>;

export const campanhasMarketingSeed: CampanhaMarketing[] = [
  buildMarketingCampaign({
    id: "mk1",
    name: "Instagram - imóveis alto padrão",
    channel: "Instagram",
    objective: "Leads qualificados",
    status: "Ativa",
    startDate: "2026-06-03",
    endDate: "2026-07-15",
    investment: 3600,
    responsiblePerson: "Camila Reis",
    notes: "Criativos com tour em vídeo e chamada para atendimento consultivo.",
    diagnosis: "Boa geração de leads com entrega forte nos Jardins.",
    dailyMetrics: [
      { date: "2026-06-24", leads: 8, clicks: 154, accesses: 96, views: 2360 },
      { date: "2026-06-25", leads: 11, clicks: 210, accesses: 128, views: 2820 },
      { date: "2026-06-26", leads: 9, clicks: 184, accesses: 116, views: 2510 },
      { date: "2026-06-27", leads: 13, clicks: 232, accesses: 146, views: 3180 },
      { date: "2026-06-28", leads: 10, clicks: 195, accesses: 123, views: 2710 },
      { date: "2026-06-29", leads: 12, clicks: 242, accesses: 151, views: 3350 },
      { date: "2026-06-30", leads: 9, clicks: 203, accesses: 126, views: 2890 },
    ],
    locationBreakdown: marketingLocations.jardins,
    createdAt: "2026-06-03T09:00:00.000Z",
    updatedAt: "2026-06-30T18:20:00.000Z",
    imobiliaria: "cordial",
  }),
  buildMarketingCampaign({
    id: "mk2",
    name: "Campanha Google - imóveis à venda",
    channel: "Google",
    objective: "Venda",
    status: "Ativa",
    startDate: "2026-06-08",
    endDate: "2026-07-20",
    investment: 4200,
    responsiblePerson: "Marcos Lima",
    notes: "Busca com foco em intenção de compra e bairros com estoque ativo.",
    diagnosis: "Desempenho consistente com boa captação no Centro.",
    dailyMetrics: [
      { date: "2026-06-24", leads: 12, clicks: 250, accesses: 164, views: 1250 },
      { date: "2026-06-25", leads: 13, clicks: 270, accesses: 172, views: 1370 },
      { date: "2026-06-26", leads: 11, clicks: 230, accesses: 151, views: 1190 },
      { date: "2026-06-27", leads: 15, clicks: 310, accesses: 201, views: 1560 },
      { date: "2026-06-28", leads: 12, clicks: 265, accesses: 169, views: 1280 },
      { date: "2026-06-29", leads: 14, clicks: 300, accesses: 195, views: 1480 },
      { date: "2026-06-30", leads: 11, clicks: 275, accesses: 168, views: 1310 },
    ],
    locationBreakdown: marketingLocations.centro,
    createdAt: "2026-06-08T11:30:00.000Z",
    updatedAt: "2026-06-30T18:25:00.000Z",
    imobiliaria: "cordial",
  }),
  buildMarketingCampaign({
    id: "mk3",
    name: "WhatsApp - atendimento ativo",
    channel: "WhatsApp",
    objective: "Relacionamento",
    status: "Em análise",
    startDate: "2026-06-17",
    endDate: "2026-07-05",
    investment: 650,
    responsiblePerson: "Paula Souza",
    notes: "Disparo segmentado para contatos que pediram retorno sobre imóveis similares.",
    diagnosis: "Alta conversão, mas volume ainda concentrado em poucos bairros.",
    dailyMetrics: [
      { date: "2026-06-24", leads: 4, clicks: 46, accesses: 31, views: 290 },
      { date: "2026-06-25", leads: 5, clicks: 58, accesses: 40, views: 330 },
      { date: "2026-06-26", leads: 3, clicks: 42, accesses: 29, views: 260 },
      { date: "2026-06-27", leads: 6, clicks: 72, accesses: 51, views: 420 },
      { date: "2026-06-28", leads: 4, clicks: 55, accesses: 39, views: 310 },
      { date: "2026-06-29", leads: 4, clicks: 61, accesses: 44, views: 360 },
      { date: "2026-06-30", leads: 3, clicks: 46, accesses: 32, views: 280 },
    ],
    locationBreakdown: marketingLocations.whatsapp,
    createdAt: "2026-06-17T10:10:00.000Z",
    updatedAt: "2026-06-30T17:45:00.000Z",
    imobiliaria: "morar",
  }),
  buildMarketingCampaign({
    id: "mk4",
    name: "Open house Jardins",
    channel: "Open house",
    objective: "Visitas",
    status: "Ativa",
    startDate: "2026-06-20",
    endDate: "2026-07-06",
    investment: 1800,
    responsiblePerson: "Felipe Andrade",
    notes: "Convites por Instagram, base própria e parceiros locais.",
    diagnosis: "Boa geração de visitas com custo por lead controlado.",
    dailyMetrics: [
      { date: "2026-06-24", leads: 5, clicks: 86, accesses: 57, views: 830 },
      { date: "2026-06-25", leads: 6, clicks: 104, accesses: 70, views: 920 },
      { date: "2026-06-26", leads: 7, clicks: 120, accesses: 78, views: 1030 },
      { date: "2026-06-27", leads: 9, clicks: 148, accesses: 98, views: 1210 },
      { date: "2026-06-28", leads: 6, clicks: 110, accesses: 73, views: 960 },
      { date: "2026-06-29", leads: 5, clicks: 97, accesses: 64, views: 880 },
      { date: "2026-06-30", leads: 4, clicks: 95, accesses: 62, views: 790 },
    ],
    locationBreakdown: marketingLocations.openHouse,
    createdAt: "2026-06-20T08:40:00.000Z",
    updatedAt: "2026-06-30T19:00:00.000Z",
    imobiliaria: "cordial",
  }),
  buildMarketingCampaign({
    id: "mk5",
    name: "Facebook - captação de leads",
    channel: "Facebook",
    objective: "Captação",
    status: "Com baixo desempenho",
    startDate: "2026-06-10",
    endDate: "2026-07-02",
    investment: 2100,
    responsiblePerson: "Camila Reis",
    notes: "Público amplo para captação de proprietários sem criativo regional.",
    diagnosis: "Alta visualização com baixa conversão; precisa revisar criativo.",
    dailyMetrics: [
      { date: "2026-06-24", leads: 2, clicks: 120, accesses: 80, views: 1920 },
      { date: "2026-06-25", leads: 3, clicks: 136, accesses: 88, views: 2110 },
      { date: "2026-06-26", leads: 2, clicks: 112, accesses: 75, views: 1860 },
      { date: "2026-06-27", leads: 4, clicks: 150, accesses: 101, views: 2380 },
      { date: "2026-06-28", leads: 3, clicks: 128, accesses: 84, views: 2040 },
      { date: "2026-06-29", leads: 3, clicks: 142, accesses: 93, views: 2230 },
      { date: "2026-06-30", leads: 2, clicks: 102, accesses: 69, views: 1760 },
    ],
    locationBreakdown: marketingLocations.facebook,
    createdAt: "2026-06-10T13:20:00.000Z",
    updatedAt: "2026-06-30T16:15:00.000Z",
    imobiliaria: "morar",
  }),
  buildMarketingCampaign({
    id: "mk6",
    name: "Remarketing locação",
    channel: "WhatsApp",
    objective: "Locação",
    status: "Pausada",
    startDate: "2026-06-01",
    endDate: "2026-06-24",
    investment: 900,
    responsiblePerson: "Marcos Lima",
    notes: "Pausada após saturação da lista e queda no volume de respostas.",
    diagnosis: "CPL dentro da média, porém entrega perdeu ritmo na última semana.",
    dailyMetrics: [
      { date: "2026-06-18", leads: 3, clicks: 52, accesses: 36, views: 560 },
      { date: "2026-06-19", leads: 2, clicks: 44, accesses: 30, views: 510 },
      { date: "2026-06-20", leads: 3, clicks: 55, accesses: 37, views: 590 },
      { date: "2026-06-21", leads: 2, clicks: 40, accesses: 27, views: 480 },
      { date: "2026-06-22", leads: 3, clicks: 54, accesses: 35, views: 620 },
      { date: "2026-06-23", leads: 2, clicks: 42, accesses: 28, views: 500 },
      { date: "2026-06-24", leads: 2, clicks: 43, accesses: 30, views: 540 },
    ],
    locationBreakdown: marketingLocations.locacao,
    createdAt: "2026-06-01T09:45:00.000Z",
    updatedAt: "2026-06-24T14:30:00.000Z",
    imobiliaria: "morar",
  }),
  buildMarketingCampaign({
    id: "mk7",
    name: "E-mail - proprietários premium",
    channel: "E-mail",
    objective: "Captação",
    status: "Planejada",
    startDate: "2026-07-08",
    endDate: "2026-07-26",
    investment: 0,
    expectedLeads: 25,
    responsiblePerson: "Paula Souza",
    notes: "Base segmentada de proprietários com imóveis acima de R$ 1,2 mi.",
    diagnosis: "Campanha planejada; aguarda validação da lista e dos criativos.",
    dailyMetrics: [
      { date: "2026-07-08", leads: 0, clicks: 0, accesses: 0, views: 0 },
      { date: "2026-07-09", leads: 0, clicks: 0, accesses: 0, views: 0 },
      { date: "2026-07-10", leads: 0, clicks: 0, accesses: 0, views: 0 },
    ],
    locationBreakdown: marketingLocations.planejada,
    createdAt: "2026-06-28T10:00:00.000Z",
    updatedAt: "2026-06-28T10:00:00.000Z",
    imobiliaria: "cordial",
  }),
  buildMarketingCampaign({
    id: "mk8",
    name: "Portal - casas em condomínio",
    channel: "Portal imobiliário",
    objective: "Leads qualificados",
    status: "Encerrada",
    startDate: "2026-05-18",
    endDate: "2026-06-18",
    investment: 2400,
    responsiblePerson: "Felipe Andrade",
    notes: "Destaque em portais para imóveis com ticket entre R$ 850 mil e R$ 1,4 mi.",
    diagnosis: "Resultado forte e entrega bem distribuída entre regiões prioritárias.",
    dailyMetrics: [
      { date: "2026-06-12", leads: 8, clicks: 150, accesses: 105, views: 1500 },
      { date: "2026-06-13", leads: 7, clicks: 138, accesses: 96, views: 1420 },
      { date: "2026-06-14", leads: 9, clicks: 175, accesses: 122, views: 1790 },
      { date: "2026-06-15", leads: 8, clicks: 160, accesses: 111, views: 1610 },
      { date: "2026-06-16", leads: 9, clicks: 184, accesses: 128, views: 1880 },
      { date: "2026-06-17", leads: 7, clicks: 148, accesses: 102, views: 1510 },
      { date: "2026-06-18", leads: 8, clicks: 165, accesses: 116, views: 1690 },
    ],
    locationBreakdown: marketingLocations.portal,
    createdAt: "2026-05-18T12:00:00.000Z",
    updatedAt: "2026-06-18T18:00:00.000Z",
    imobiliaria: "morar",
  }),
  buildMarketingCampaign({
    id: "mk9",
    name: "Ação local - indicação bairros",
    channel: "Externa",
    objective: "Reconhecimento",
    status: "Ativa",
    startDate: "2026-06-21",
    endDate: "2026-07-10",
    investment: 480,
    responsiblePerson: "Camila Reis",
    notes: "Parcerias locais e indicações para imóveis de entrada.",
    diagnosis: "Campanha enxuta com conversão alta e baixo custo por lead.",
    dailyMetrics: [
      { date: "2026-06-24", leads: 2, clicks: 18, accesses: 17, views: 110 },
      { date: "2026-06-25", leads: 3, clicks: 24, accesses: 22, views: 130 },
      { date: "2026-06-26", leads: 2, clicks: 20, accesses: 18, views: 120 },
      { date: "2026-06-27", leads: 4, clicks: 32, accesses: 30, views: 160 },
      { date: "2026-06-28", leads: 3, clicks: 26, accesses: 25, views: 140 },
      { date: "2026-06-29", leads: 4, clicks: 35, accesses: 33, views: 170 },
      { date: "2026-06-30", leads: 3, clicks: 25, accesses: 25, views: 120 },
    ],
    locationBreakdown: marketingLocations.local,
    createdAt: "2026-06-21T09:15:00.000Z",
    updatedAt: "2026-06-30T17:05:00.000Z",
    imobiliaria: "cordial",
  }),
];

export type DocumentoOperacional = {
  id: string;
  titulo: string;
  categoria: "Contrato" | "Vistoria" | "Proposta" | "Cadastro";
  responsavel: string;
  atualizadoEm: string;
  status: "Assinado" | "Pendente" | "Em revisão";
  imobiliaria: AgencyId;
};

export const documentosSeed: DocumentoOperacional[] = [
  {
    id: "doc1",
    titulo: "Contrato CRD-2026-002",
    categoria: "Contrato",
    responsavel: "Paula Souza",
    atualizadoEm: "2026-06-11",
    status: "Pendente",
    imobiliaria: "cordial",
  },
  {
    id: "doc2",
    titulo: "Laudo Loft Vila Madalena",
    categoria: "Vistoria",
    responsavel: "Marcos Lima",
    atualizadoEm: "2026-06-10",
    status: "Em revisão",
    imobiliaria: "cordial",
  },
  {
    id: "doc3",
    titulo: "Proposta Casa Bragança",
    categoria: "Proposta",
    responsavel: "Felipe Andrade",
    atualizadoEm: "2026-06-08",
    status: "Assinado",
    imobiliaria: "morar",
  },
  {
    id: "doc4",
    titulo: "Cadastro proprietário Itaim",
    categoria: "Cadastro",
    responsavel: "Camila Reis",
    atualizadoEm: "2026-06-07",
    status: "Pendente",
    imobiliaria: "morar",
  },
];

export type IntegracaoOperacional = {
  id: string;
  nome: string;
  categoria: "Financeiro" | "Portais" | "Assinatura" | "Comunicação";
  sincronizacoes: number;
  ultimaSync: string;
  status: "Conectada" | "Atenção" | "Disponível";
  imobiliaria: AgencyId;
};

export const integracoesSeed: IntegracaoOperacional[] = [
  {
    id: "int1",
    nome: "Conta Azul",
    categoria: "Financeiro",
    sincronizacoes: 128,
    ultimaSync: "2026-06-12T08:30:00",
    status: "Conectada",
    imobiliaria: "cordial",
  },
  {
    id: "int2",
    nome: "Zap Imóveis",
    categoria: "Portais",
    sincronizacoes: 84,
    ultimaSync: "2026-06-12T07:45:00",
    status: "Conectada",
    imobiliaria: "cordial",
  },
  {
    id: "int3",
    nome: "DocuSign",
    categoria: "Assinatura",
    sincronizacoes: 23,
    ultimaSync: "2026-06-11T17:20:00",
    status: "Atenção",
    imobiliaria: "morar",
  },
  {
    id: "int4",
    nome: "WhatsApp Business",
    categoria: "Comunicação",
    sincronizacoes: 0,
    ultimaSync: "2026-06-01T09:00:00",
    status: "Disponível",
    imobiliaria: "morar",
  },
];

export type ConfiguracaoOperacional = {
  id: string;
  grupo: "Equipe" | "Comercial" | "Financeiro" | "Sistema";
  nome: string;
  valor: string;
  status: "Ativo" | "Revisar";
  imobiliaria: AgencyId;
};

export const configuracoesSeed: ConfiguracaoOperacional[] = [
  {
    id: "cfg1",
    grupo: "Equipe",
    nome: "Meta mensal de atendimentos",
    valor: "80 atendimentos",
    status: "Ativo",
    imobiliaria: "cordial",
  },
  {
    id: "cfg2",
    grupo: "Comercial",
    nome: "SLA para novos leads",
    valor: "15 minutos",
    status: "Ativo",
    imobiliaria: "cordial",
  },
  {
    id: "cfg3",
    grupo: "Financeiro",
    nome: "Dia padrão de repasse",
    valor: "Todo dia 7",
    status: "Revisar",
    imobiliaria: "morar",
  },
  {
    id: "cfg4",
    grupo: "Sistema",
    nome: "Assinatura digital obrigatória",
    valor: "Contratos de venda",
    status: "Ativo",
    imobiliaria: "morar",
  },
];

export type Aluguel = {
  id: string;
  contratoId: string;
  clienteId: string;
  imovelId: string;
  valorMensal: number;
  vencimentoDia: number;
  garantia: "Fiador" | "Caução" | "Seguro fiança" | "CredPago";
  reajuste: string;
  status: "Ativo" | "Pendente assinatura" | "Encerrado" | "Inadimplente";
  imobiliaria: AgencyId;
};

export const alugueisSeed: Aluguel[] = [
  {
    id: "alg1",
    contratoId: "ct2",
    clienteId: "cl5",
    imovelId: "im6",
    valorMensal: 1250,
    vencimentoDia: 10,
    garantia: "Caução",
    reajuste: "IGP-M anual",
    status: "Ativo",
    imobiliaria: "morar",
  },
  {
    id: "alg2",
    contratoId: "ct3",
    clienteId: "cl2",
    imovelId: "im4",
    valorMensal: 1200,
    vencimentoDia: 5,
    garantia: "Fiador",
    reajuste: "IPCA anual",
    status: "Pendente assinatura",
    imobiliaria: "cordial",
  },
  {
    id: "alg3",
    contratoId: "ct5",
    clienteId: "cl6",
    imovelId: "im7",
    valorMensal: 1000,
    vencimentoDia: 15,
    garantia: "Seguro fiança",
    reajuste: "IPCA anual",
    status: "Ativo",
    imobiliaria: "cordial",
  },
];

export type Venda = {
  id: string;
  contratoId?: string;
  clienteId: string;
  imovelId: string;
  valorVenda: number;
  comissaoPercentual: number;
  sinal: number;
  formaPagamento: "À vista" | "Financiamento" | "Consórcio" | "Permuta" | "Parcelado" | "Outro";
  etapa: "Proposta" | "Documentação" | "Assinatura" | "Registro" | "Concluída" | "Perdida";
  previsaoEscritura: string;
  imobiliaria: AgencyId;
  propertyName?: string;
  propertyAddress?: string;
  propertyNeighborhood?: string;
  propertyCityState?: string;
  propertyType?: ImovelTipo | "Fazenda" | "Outro";
  bedrooms?: number;
  bathrooms?: number;
  areaM2?: number;
  previousAskingPrice?: number;
  buyerName?: string;
  buyerDocument?: string;
  buyerPhone?: string;
  buyerEmail?: string;
  buyerAddress?: string;
  buyerObservations?: string;
  saleDate?: string;
  saleStatus?: "concluida" | "aguardando_assinatura" | "em_analise" | "cancelada";
  paymentMethod?: "À vista" | "Financiamento" | "Consórcio" | "Permuta" | "Parcelado" | "Outro";
  paymentDetails?: string;
  commissionValue?: number;
  commissionPercentage?: number;
  responsibleAgent?: string;
  contractFileUrl?: string;
  contractFileName?: string;
  supportingDocumentFileName?: string;
  documentStatus?:
    "contrato_anexado" | "contrato_pendente" | "aguardando_assinatura" | "em_analise" | "cancelado";
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const vendasSeed: Venda[] = [
  {
    id: "vd1",
    contratoId: "ct1",
    clienteId: "cl1",
    imovelId: "im2",
    valorVenda: 430000,
    comissaoPercentual: 5,
    sinal: 43000,
    formaPagamento: "Financiamento",
    etapa: "Concluída",
    previsaoEscritura: "2026-07-05",
    imobiliaria: "cordial",
  },
  {
    id: "vd2",
    contratoId: "ct4",
    clienteId: "cl3",
    imovelId: "im3",
    valorVenda: 780000,
    comissaoPercentual: 5,
    sinal: 78000,
    formaPagamento: "Financiamento",
    etapa: "Documentação",
    previsaoEscritura: "2026-07-20",
    imobiliaria: "morar",
  },
  {
    id: "vd3",
    clienteId: "cl6",
    imovelId: "im8",
    valorVenda: 300000,
    comissaoPercentual: 6,
    sinal: 30000,
    formaPagamento: "À vista",
    etapa: "Proposta",
    previsaoEscritura: "2026-08-01",
    imobiliaria: "morar",
  },
];

export type IntegracaoContaAzul = {
  id: string;
  imobiliaria: AgencyId;
  status: "Conectado" | "Pendente" | "Erro";
  empresa: string;
  ultimoSync: string;
  contasReceberSync: number;
  contasPagarSync: number;
  observacao?: string;
};

export const integracoesContaAzulSeed: IntegracaoContaAzul[] = [
  {
    id: "ca1",
    imobiliaria: "cordial",
    status: "Conectado",
    empresa: "Cordial Imóveis Santa Rosa Ltda.",
    ultimoSync: "2026-06-12T07:45:00",
    contasReceberSync: 18,
    contasPagarSync: 7,
  },
  {
    id: "ca2",
    imobiliaria: "morar",
    status: "Pendente",
    empresa: "Morar Imóveis Noroeste Ltda.",
    ultimoSync: "2026-06-10T18:10:00",
    contasReceberSync: 9,
    contasPagarSync: 4,
    observacao: "Aguardando renovação do token OAuth.",
  },
];

export type Permissao = {
  id: string;
  nome: string;
  descricao: string;
  recursos: string[];
};

export const permissoesSeed: Permissao[] = [
  {
    id: "perm-admin",
    nome: "Administrador",
    descricao: "Acesso total às duas imobiliárias e configurações.",
    recursos: ["clientes", "imoveis", "financeiro", "usuarios", "integracoes"],
  },
  {
    id: "perm-corretor",
    nome: "Corretor",
    descricao: "Gerencia leads, atendimentos, imóveis e agenda próprios.",
    recursos: ["clientes", "imoveis", "atendimentos", "agenda"],
  },
  {
    id: "perm-financeiro",
    nome: "Financeiro",
    descricao: "Opera contratos, lançamentos, projeções e integrações contábeis.",
    recursos: ["contratos", "financeiro", "integracoes"],
  },
];

export type UsuarioSistema = {
  id: string;
  nome: string;
  email: string;
  corretorId?: string;
  imobiliaria: AgencyId | "todas";
  permissaoId: string;
  ativo: boolean;
  ultimoAcesso: string;
};

export const usuariosSistemaSeed: UsuarioSistema[] = [
  {
    id: "u1",
    nome: "Admin Cordial",
    email: "admin@cordial.local",
    imobiliaria: "todas",
    permissaoId: "perm-admin",
    ativo: true,
    ultimoAcesso: "2026-06-12T08:10:00",
  },
  {
    id: "u2",
    nome: "Paula Souza",
    email: "paula@cordial.local",
    corretorId: "c2",
    imobiliaria: "cordial",
    permissaoId: "perm-corretor",
    ativo: true,
    ultimoAcesso: "2026-06-12T09:20:00",
  },
  {
    id: "u3",
    nome: "Felipe Andrade",
    email: "felipe@morar.local",
    corretorId: "c3",
    imobiliaria: "morar",
    permissaoId: "perm-corretor",
    ativo: true,
    ultimoAcesso: "2026-06-11T18:00:00",
  },
  {
    id: "u4",
    nome: "Financeiro Morar",
    email: "financeiro@morar.local",
    imobiliaria: "morar",
    permissaoId: "perm-financeiro",
    ativo: true,
    ultimoAcesso: "2026-06-12T07:55:00",
  },
];

export type ProjecaoFinanceira = {
  id: string;
  mes: string;
  receitasAluguel: number;
  receitasVenda: number;
  comissoes: number;
  despesas: number;
  resultadoPrevisto: number;
  imobiliaria: AgencyId;
};

export const projecoesFinanceirasSeed: ProjecaoFinanceira[] = [
  {
    id: "pf1",
    mes: "2026-06",
    receitasAluguel: 3450,
    receitasVenda: 60500,
    comissoes: 24300,
    despesas: 6800,
    resultadoPrevisto: 57150,
    imobiliaria: "cordial",
  },
  {
    id: "pf2",
    mes: "2026-06",
    receitasAluguel: 1250,
    receitasVenda: 54000,
    comissoes: 21000,
    despesas: 5200,
    resultadoPrevisto: 50050,
    imobiliaria: "morar",
  },
  {
    id: "pf3",
    mes: "2026-07",
    receitasAluguel: 4700,
    receitasVenda: 39000,
    comissoes: 18500,
    despesas: 6100,
    resultadoPrevisto: 37600,
    imobiliaria: "cordial",
  },
  {
    id: "pf4",
    mes: "2026-07",
    receitasAluguel: 2500,
    receitasVenda: 15000,
    comissoes: 9600,
    despesas: 4800,
    resultadoPrevisto: 12700,
    imobiliaria: "morar",
  },
];

export const dashboardComparativoCordialMorar = [
  {
    imobiliaria: "Cordial",
    conversao: 28,
    atendimentos: 142,
    alugueis: 18,
    vendas: 9,
    receitaPrevista: 480000,
    origemContatos: "Instagram",
  },
  {
    imobiliaria: "Morar",
    conversao: 22,
    atendimentos: 96,
    alugueis: 24,
    vendas: 4,
    receitaPrevista: 280000,
    origemContatos: "Indicação",
  },
];

export const dashboardEvolucaoMensal = [
  { mes: "Jan", cordial: 42, morar: 28, total: 70 },
  { mes: "Fev", cordial: 51, morar: 33, total: 84 },
  { mes: "Mar", cordial: 38, morar: 30, total: 68 },
  { mes: "Abr", cordial: 64, morar: 41, total: 105 },
  { mes: "Mai", cordial: 72, morar: 48, total: 120 },
  { mes: "Jun", cordial: 88, morar: 55, total: 143 },
];

export const dashboardOrigemLeads = [
  { origem: "Instagram", total: 62, cordial: 38, morar: 24 },
  { origem: "Indicação", total: 48, cordial: 22, morar: 26 },
  { origem: "Site", total: 36, cordial: 20, morar: 16 },
  { origem: "WhatsApp", total: 28, cordial: 16, morar: 12 },
  { origem: "Portais", total: 22, cordial: 12, morar: 10 },
];

export const dashboardAluguelVenda = [
  { mes: "Jan", venda: 6, aluguel: 12 },
  { mes: "Fev", venda: 8, aluguel: 14 },
  { mes: "Mar", venda: 5, aluguel: 11 },
  { mes: "Abr", venda: 11, aluguel: 18 },
  { mes: "Mai", venda: 14, aluguel: 21 },
  { mes: "Jun", venda: 17, aluguel: 25 },
];

export const dashboardPrevisaoFinanceira = [
  { mes: "Jan", receita: 320000, comissao: 28000, aberto: 42000 },
  { mes: "Fev", receita: 380000, comissao: 32000, aberto: 38000 },
  { mes: "Mar", receita: 290000, comissao: 24000, aberto: 51000 },
  { mes: "Abr", receita: 460000, comissao: 41000, aberto: 33000 },
  { mes: "Mai", receita: 540000, comissao: 48000, aberto: 28000 },
  { mes: "Jun", receita: 620000, comissao: 56000, aberto: 22000 },
];

export const dashboardDesempenhoCorretores = [
  { nome: "Ana Souza", imobiliaria: "cordial" as AgencyId, atendimentos: 48, contratos: 9 },
  { nome: "Bruno Lima", imobiliaria: "cordial" as AgencyId, atendimentos: 41, contratos: 7 },
  { nome: "Camila Reis", imobiliaria: "morar" as AgencyId, atendimentos: 36, contratos: 6 },
  { nome: "Diego Alves", imobiliaria: "morar" as AgencyId, atendimentos: 29, contratos: 4 },
];
