import edificioHarmonia from "@/assets/properties/edificio-harmonia.jpg";
import aptoJardins from "@/assets/properties/apto-jardins.jpg";
import casaBraganca from "@/assets/properties/casa-braganca.jpg";
import loftVilaMadalena from "@/assets/properties/loft-vila-madalena.jpg";
import coberturaItaim from "@/assets/properties/cobertura-itaim.jpg";
import casaVilaNova from "@/assets/properties/casa-vila-nova.jpg";
import type { Client } from "@/types/client";
import type { Corretor } from "@/types/corretor";
import type { Agenciamento } from "@/types/agenciamento";

export type { Corretor } from "@/types/corretor";
export type { Agenciamento } from "@/types/agenciamento";

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
  | "Pendente"
  | "Recebido"
  | "Em análise"
  | "Aprovado"
  | "Reprovado"
  | "Vencido";
export type ImovelTipo =
  | "Apartamento"
  | "Casa"
  | "Cobertura"
  | "Loft"
  | "Terreno"
  | "Sala comercial"
  | "Sítio";
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

export const agenciamentosSeed: Agenciamento[] = [
  {
    id: "ag-001",
    tipoImovel: "casa",
    endereco: "Rua Coronel Bordini, 780",
    bairro: "Centro",
    cidade: "Canoas",
    imobiliaria: "cordial",
    descricaoImovel: "Casa terrea com patio amplo e garagem para dois carros.",
    proprietarioNome: "Joao Silva",
    proprietarioTelefone: "(51) 99812-3344",
    proprietarioContatoPreferencial: "whatsapp",
    proprietarioObservacoes: "Prefere contato no fim da tarde.",
    corretorId: "c3",
    corretorNome: "Felipe Andrade",
    dataAgenciamento: "2026-06-18T10:30:00.000Z",
    origem: "indicacao",
    status: "pendente_site",
    checklist: {
      fotosRealizadas: true,
      fotosDrive: true,
      placaInstalada: true,
      cadastradoSite: false,
      videoRealizado: false,
      validado: false,
    },
    driveFolderUrl: "https://drive.google.com/drive/folders/mock-casa-centro",
    siteUrl: "",
    observacoesInternas: "Aguardando texto final para publicacao no site.",
    criadoPorId: "felipe",
    criadoPorNome: "Felipe Andrade",
    criadoEm: "2026-06-18T10:35:00.000Z",
    atualizadoEm: "2026-06-18T15:10:00.000Z",
  },
  {
    id: "ag-002",
    tipoImovel: "apartamento",
    endereco: "Avenida Cruzeiro, 1420 ap. 402",
    bairro: "Cruzeiro",
    cidade: "Porto Alegre",
    imobiliaria: "morar",
    descricaoImovel: "Apartamento com dois dormitorios, sacada e vaga coberta.",
    proprietarioNome: "Helena Martins",
    proprietarioTelefone: "(51) 99155-2288",
    proprietarioContatoPreferencial: "ligacao",
    proprietarioObservacoes: "Nao atende pela manha.",
    corretorId: "c4",
    corretorNome: "Camila Reis",
    dataAgenciamento: "2026-06-17T14:00:00.000Z",
    origem: "whatsapp",
    status: "pendente_fotos",
    checklist: {
      fotosRealizadas: false,
      fotosDrive: false,
      placaInstalada: false,
      cadastradoSite: false,
      videoRealizado: false,
      validado: false,
    },
    driveFolderUrl: "",
    siteUrl: "",
    observacoesInternas: "Fotos agendadas para o proximo sabado.",
    criadoPorId: "camila",
    criadoPorNome: "Camila Reis",
    criadoEm: "2026-06-17T14:12:00.000Z",
    atualizadoEm: "2026-06-17T14:12:00.000Z",
  },
  {
    id: "ag-003",
    tipoImovel: "terreno",
    endereco: "Rua Auxiliadora, lote 16",
    bairro: "Auxiliadora",
    cidade: "Porto Alegre",
    imobiliaria: "cordial",
    descricaoImovel: "Terreno plano, murado e com boa frente para incorporacao.",
    proprietarioNome: "Carlos Pacheco",
    proprietarioTelefone: "(51) 98744-1190",
    proprietarioContatoPreferencial: "whatsapp",
    proprietarioObservacoes: "Quer avaliacao de venda e locacao comercial.",
    corretorId: "c2",
    corretorNome: "Paula Souza",
    dataAgenciamento: "2026-06-15T09:20:00.000Z",
    origem: "prospeccao_ativa",
    status: "aguardando_validacao",
    checklist: {
      fotosRealizadas: true,
      fotosDrive: true,
      placaInstalada: true,
      cadastradoSite: true,
      videoRealizado: false,
      validado: false,
    },
    driveFolderUrl: "https://drive.google.com/drive/folders/mock-terreno-auxiliadora",
    siteUrl: "https://gestao-cordial.example/imoveis/terreno-auxiliadora",
    observacoesInternas: "Material completo; falta validacao da diretoria.",
    criadoPorId: "paula",
    criadoPorNome: "Paula Souza",
    criadoEm: "2026-06-15T09:32:00.000Z",
    atualizadoEm: "2026-06-16T11:10:00.000Z",
  },
  {
    id: "ag-004",
    tipoImovel: "sala_comercial",
    endereco: "Rua dos Andradas, 980 sala 504",
    bairro: "Centro",
    cidade: "Porto Alegre",
    imobiliaria: "ambas",
    descricaoImovel: "Sala comercial pronta para consultorio, com recepcao e lavabo.",
    proprietarioNome: "Marina Teixeira",
    proprietarioTelefone: "(51) 99976-4412",
    proprietarioContatoPreferencial: "email",
    proprietarioObservacoes: "Enviar relatorios por e-mail.",
    corretorId: "c1",
    corretorNome: "Marcos Lima",
    dataAgenciamento: "2026-06-12T16:45:00.000Z",
    origem: "cliente_antigo",
    status: "validado",
    checklist: {
      fotosRealizadas: true,
      fotosDrive: true,
      placaInstalada: true,
      cadastradoSite: true,
      videoRealizado: true,
      validado: true,
    },
    driveFolderUrl: "https://drive.google.com/drive/folders/mock-sala-centro",
    siteUrl: "https://gestao-cordial.example/imoveis/sala-centro",
    observacoesInternas: "Agenciamento validado para gratificacao futura.",
    criadoPorId: "marcos",
    criadoPorNome: "Marcos Lima",
    validadoPorId: "ricardo",
    validadoPorNome: "Ricardo",
    validadoEm: "2026-06-13T09:15:00.000Z",
    criadoEm: "2026-06-12T16:50:00.000Z",
    atualizadoEm: "2026-06-13T09:15:00.000Z",
  },
  {
    id: "ag-005",
    tipoImovel: "casa",
    endereco: "Rua das Hortensias, 245",
    bairro: "Moinhos",
    cidade: "Canoas",
    imobiliaria: "cordial",
    descricaoImovel: "Sobrado familiar com tres suites e espaco gourmet.",
    proprietarioNome: "Eduardo Valente",
    proprietarioTelefone: "(51) 99620-1188",
    proprietarioContatoPreferencial: "whatsapp",
    proprietarioObservacoes: "Quer placa apenas apos revisar valor.",
    corretorId: "c1",
    corretorNome: "Marcos Lima",
    dataAgenciamento: "2026-06-10T11:10:00.000Z",
    origem: "presencial",
    status: "pendente_placa",
    checklist: {
      fotosRealizadas: true,
      fotosDrive: true,
      placaInstalada: false,
      cadastradoSite: true,
      videoRealizado: true,
      validado: false,
    },
    driveFolderUrl: "https://drive.google.com/drive/folders/mock-hortensias",
    siteUrl: "https://gestao-cordial.example/imoveis/casa-hortensias",
    observacoesInternas: "Placa depende de aceite formal do proprietario.",
    criadoPorId: "marcos",
    criadoPorNome: "Marcos Lima",
    criadoEm: "2026-06-10T11:25:00.000Z",
    atualizadoEm: "2026-06-14T10:00:00.000Z",
  },
  {
    id: "ag-006",
    tipoImovel: "area_rural",
    endereco: "Estrada do Faxinal, km 8",
    bairro: "Interior",
    cidade: "Gravatai",
    imobiliaria: "morar",
    descricaoImovel: "Area rural com casa simples, galpao e acesso por estrada municipal.",
    proprietarioNome: "Lucia Nunes",
    proprietarioTelefone: "(51) 98402-7070",
    proprietarioContatoPreferencial: "ligacao",
    proprietarioObservacoes: "Sinal de celular instavel no local.",
    corretorId: "c3",
    corretorNome: "Felipe Andrade",
    dataAgenciamento: "2026-05-28T13:20:00.000Z",
    origem: "site",
    status: "em_andamento",
    checklist: {
      fotosRealizadas: true,
      fotosDrive: false,
      placaInstalada: false,
      cadastradoSite: false,
      videoRealizado: true,
      validado: false,
    },
    driveFolderUrl: "",
    siteUrl: "",
    observacoesInternas: "Falta subir material no Drive em conexao estavel.",
    criadoPorId: "felipe",
    criadoPorNome: "Felipe Andrade",
    criadoEm: "2026-05-28T13:42:00.000Z",
    atualizadoEm: "2026-06-02T09:40:00.000Z",
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

export const clientesSeed: Cliente[] = [
  {
    id: "cl1",
    nome: "Ana Beatriz Moreira",
    iniciais: "AB",
    telefone: "(55) 98765-1234",
    whatsapp: "(55) 98765-1234",
    email: "ana.beatriz@email.com",
    tipo: "Comprador",
    interesse: "Apartamento 2 dormitórios no Centro ou Cruzeiro",
    orcamento: 520000,
    perfilBusca:
      "Busca apartamento pronto para morar, com elevador e vaga, próximo a mercado e escola.",
    origem: "Instagram",
    faixaValor: { minimo: 300000, maximo: 550000 },
    bairros: ["Centro", "Cruzeiro", "Auxiliadora"],
    historico: [
      {
        data: "2026-05-21T10:20:00",
        tipo: "WhatsApp",
        descricao: "Enviou referências de apartamentos no Centro de Santa Rosa.",
        responsavelId: "c1",
      },
      {
        data: "2026-06-10T13:50:00",
        tipo: "Visita",
        descricao: "Visita agendada no Residencial Harmonia.",
        responsavelId: "c1",
      },
    ],
    documentos: [
      { id: "doc-cl1-1", nome: "RG e CPF", status: "Recebido" },
      { id: "doc-cl1-2", nome: "Comprovante de renda", status: "Pendente" },
    ],
    lembretes: [
      {
        id: "lem-cl1-1",
        data: "2026-06-13T09:00:00",
        titulo: "Confirmar visita no Centro",
        concluido: false,
      },
    ],
    timeline: [
      { data: "2026-05-21", etapa: "Lead criado", detalhe: "Lead captado pelo Instagram." },
      {
        data: "2026-06-10",
        etapa: "Visita",
        detalhe: "Residencial Harmonia selecionado para visita.",
      },
    ],
    imobiliaria: "cordial",
    criadoEm: "2026-05-21",
  },
  {
    id: "cl2",
    nome: "João Pedro Salles",
    iniciais: "JP",
    telefone: "(55) 99123-4567",
    whatsapp: "(55) 99123-4567",
    email: "jp.salles@email.com",
    tipo: "Locatário",
    interesse: "Apartamento compacto no Planalto ou Timbaúva",
    orcamento: 1300,
    perfilBusca: "Locação rápida, aceita apartamento sem garagem se estiver próximo ao trabalho.",
    origem: "WhatsApp",
    faixaValor: { minimo: 1000, maximo: 1300 },
    bairros: ["Planalto", "Timbaúva", "Centro"],
    historico: [
      {
        data: "2026-06-11T09:15:00",
        tipo: "Proposta",
        descricao: "Propôs aluguel de R$ 1.200 com entrada imediata.",
        responsavelId: "c2",
      },
    ],
    documentos: [
      { id: "doc-cl2-1", nome: "Comprovante de renda", status: "Recebido" },
      { id: "doc-cl2-2", nome: "Ficha cadastral", status: "Em análise" },
    ],
    lembretes: [
      {
        id: "lem-cl2-1",
        data: "2026-06-12T14:30:00",
        titulo: "Revisar proposta de locação",
        concluido: false,
      },
    ],
    timeline: [
      { data: "2026-06-01", etapa: "Lead criado", detalhe: "Contato via WhatsApp." },
      { data: "2026-06-11", etapa: "Proposta", detalhe: "Proposta enviada ao proprietário." },
    ],
    imobiliaria: "cordial",
    criadoEm: "2026-06-01",
  },
  {
    id: "cl3",
    nome: "Marina Costa",
    iniciais: "MC",
    telefone: "(55) 97777-8888",
    whatsapp: "(55) 97777-8888",
    email: "marina@email.com",
    tipo: "Comprador",
    interesse: "Casa com pátio no Cruzeiro ou Sulina",
    orcamento: 780000,
    perfilBusca: "Família precisa de casa com três dormitórios, pátio fechado e espaço gourmet.",
    origem: "Indicação",
    faixaValor: { minimo: 450000, maximo: 800000 },
    bairros: ["Cruzeiro", "Sulina", "Glória"],
    historico: [
      {
        data: "2026-06-11T11:30:00",
        tipo: "WhatsApp",
        descricao: "Recebeu opções no Cruzeiro e Sulina.",
        responsavelId: "c3",
      },
    ],
    documentos: [{ id: "doc-cl3-1", nome: "Carta de crédito", status: "Pendente" }],
    lembretes: [
      {
        id: "lem-cl3-1",
        data: "2026-06-15T10:00:00",
        titulo: "Simular financiamento",
        concluido: false,
      },
    ],
    timeline: [
      {
        data: "2026-06-04",
        etapa: "Qualificação",
        detalhe: "Cliente com financiamento pré-aprovado em análise.",
      },
    ],
    imobiliaria: "morar",
    criadoEm: "2026-06-04",
  },
  {
    id: "cl4",
    nome: "Ricardo Tavares",
    iniciais: "RT",
    telefone: "(55) 96666-5555",
    whatsapp: "(55) 96666-5555",
    email: "rtavares@email.com",
    tipo: "Proprietário",
    interesse: "Listar cobertura no Centro",
    orcamento: 0,
    perfilBusca: "Proprietário quer venda com exclusividade por 90 dias e avaliação mensal.",
    origem: "Carteira antiga",
    faixaValor: { minimo: 0, maximo: 0 },
    bairros: ["Centro"],
    historico: [
      {
        data: "2026-05-15T15:00:00",
        tipo: "Ligação",
        descricao: "Solicitou avaliação para venda de cobertura.",
        responsavelId: "c4",
      },
    ],
    documentos: [
      {
        id: "doc-cl4-1",
        nome: "Matrícula atualizada",
        status: "Recebido",
        vencimento: "2026-07-15",
      },
    ],
    lembretes: [
      {
        id: "lem-cl4-1",
        data: "2026-06-14T15:00:00",
        titulo: "Fotografar cobertura",
        concluido: false,
      },
    ],
    timeline: [
      { data: "2026-05-15", etapa: "Captação", detalhe: "Imóvel entrou para avaliação de preço." },
    ],
    imobiliaria: "morar",
    criadoEm: "2026-05-15",
  },
  {
    id: "cl5",
    nome: "Beatriz Almeida",
    iniciais: "BA",
    telefone: "(55) 95555-4444",
    whatsapp: "(55) 95555-4444",
    email: "bia.almeida@email.com",
    tipo: "Locatário",
    interesse: "Casa simples na Glória ou Auxiliadora",
    orcamento: 1250,
    perfilBusca: "Procura casa com dois dormitórios, pátio pequeno e garagem coberta.",
    origem: "Portal imobiliário",
    faixaValor: { minimo: 1000, maximo: 1300 },
    bairros: ["Glória", "Auxiliadora", "Sulina"],
    historico: [
      {
        data: "2026-06-09T16:00:00",
        tipo: "Contrato",
        descricao: "Contrato de locação aprovado para casa na Glória.",
        responsavelId: "c2",
      },
    ],
    documentos: [{ id: "doc-cl5-1", nome: "Garantia locatícia", status: "Aprovado" }],
    lembretes: [
      {
        id: "lem-cl5-1",
        data: "2026-06-20T09:00:00",
        titulo: "Vistoria de entrada",
        concluido: false,
      },
    ],
    timeline: [
      {
        data: "2026-06-09",
        etapa: "Fechamento",
        detalhe: "Locação fechada dentro da faixa de R$ 1.000 a R$ 1.300.",
      },
    ],
    imobiliaria: "cordial",
    criadoEm: "2026-06-08",
  },
  {
    id: "cl6",
    nome: "Henrique Borges",
    iniciais: "HB",
    telefone: "(55) 94444-3333",
    whatsapp: "(55) 94444-3333",
    email: "henrique.b@email.com",
    tipo: "Comprador",
    interesse: "Investimento em terreno ou apartamento até R$ 350 mil",
    orcamento: 350000,
    perfilBusca:
      "Investidor procura liquidez, aceita bairros em expansão e imóveis para reforma leve.",
    origem: "Google Ads",
    faixaValor: { minimo: 300000, maximo: 350000 },
    bairros: ["Timbaúva", "Planalto", "Arredores de Santa Rosa"],
    historico: [
      {
        data: "2026-06-11T08:45:00",
        tipo: "Visita",
        descricao: "Aguardando confirmação para terreno no Timbaúva.",
        responsavelId: "c4",
      },
    ],
    documentos: [{ id: "doc-cl6-1", nome: "Comprovante de fundos", status: "Recebido" }],
    lembretes: [
      {
        id: "lem-cl6-1",
        data: "2026-06-16T08:30:00",
        titulo: "Enviar análise de rentabilidade",
        concluido: false,
      },
    ],
    timeline: [
      {
        data: "2026-06-09",
        etapa: "Lead qualificado",
        detalhe: "Perfil de investimento validado.",
      },
    ],
    imobiliaria: "morar",
    criadoEm: "2026-06-09",
  },
];

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

export const atendimentosSeed: Atendimento[] = [
  {
    id: "a1",
    clienteId: "cl1",
    imovelId: "im1",
    corretorId: "c1",
    telefone: "(55) 98765-1234",
    whatsapp: "(55) 98765-1234",
    origem: "Instagram",
    data: "2026-06-10T13:50:00",
    imobiliaria: "cordial",
    responsavel: "Marcos Lima",
    interesse: "Comprar",
    tipoImovel: "Apartamento",
    faixaValor: { minimo: 300000, maximo: 550000 },
    bairro: "Centro",
    dormitorios: 3,
    garagem: true,
    patio: false,
    salaComercial: false,
    apartamento: true,
    casa: false,
    terreno: false,
    urgencia: "Média",
    status: "Em visita",
    historico: [
      {
        data: "2026-06-10T13:50:00",
        descricao: "Visita marcada para sábado às 10h.",
        responsavelId: "c1",
      },
    ],
    observacoes: "Visita marcada para sábado às 10h",
    criadoEm: "2026-06-10T13:50:00",
  },
  {
    id: "a2",
    clienteId: "cl2",
    imovelId: "im4",
    corretorId: "c2",
    telefone: "(55) 99123-4567",
    whatsapp: "(55) 99123-4567",
    origem: "WhatsApp",
    data: "2026-06-11T09:15:00",
    imobiliaria: "cordial",
    responsavel: "Paula Souza",
    interesse: "Alugar",
    tipoImovel: "Loft",
    faixaValor: { minimo: 1000, maximo: 1300 },
    bairro: "Planalto",
    dormitorios: 1,
    garagem: false,
    patio: false,
    salaComercial: false,
    apartamento: true,
    casa: false,
    terreno: false,
    urgencia: "Imediata",
    status: "Proposta",
    historico: [
      {
        data: "2026-06-11T09:15:00",
        descricao: "Cliente fez proposta de R$ 1.200.",
        responsavelId: "c2",
      },
    ],
    observacoes: "Cliente fez proposta de R$ 1.200",
    criadoEm: "2026-06-11T09:15:00",
  },
  {
    id: "a3",
    clienteId: "cl3",
    imovelId: "im3",
    corretorId: "c3",
    telefone: "(55) 97777-8888",
    whatsapp: "(55) 97777-8888",
    origem: "Indicação",
    data: "2026-06-11T11:30:00",
    imobiliaria: "morar",
    responsavel: "Felipe Andrade",
    interesse: "Comprar",
    tipoImovel: "Casa",
    faixaValor: { minimo: 450000, maximo: 800000 },
    bairro: "Sulina",
    dormitorios: 4,
    garagem: true,
    patio: true,
    salaComercial: false,
    apartamento: false,
    casa: true,
    terreno: false,
    urgencia: "Alta",
    status: "Aberto",
    historico: [
      {
        data: "2026-06-11T11:30:00",
        descricao: "Primeiro contato via WhatsApp e envio de fotos.",
        responsavelId: "c3",
      },
    ],
    observacoes: "Primeiro contato via WhatsApp",
    criadoEm: "2026-06-11T11:30:00",
  },
  {
    id: "a4",
    clienteId: "cl5",
    imovelId: "im6",
    corretorId: "c2",
    telefone: "(55) 95555-4444",
    whatsapp: "(55) 95555-4444",
    origem: "Portal imobiliário",
    data: "2026-06-09T16:00:00",
    imobiliaria: "cordial",
    responsavel: "Paula Souza",
    interesse: "Alugar",
    tipoImovel: "Casa",
    faixaValor: { minimo: 1000, maximo: 1300 },
    bairro: "Glória",
    dormitorios: 2,
    garagem: true,
    patio: true,
    salaComercial: false,
    apartamento: false,
    casa: true,
    terreno: false,
    urgencia: "Alta",
    status: "Fechado",
    historico: [
      {
        data: "2026-06-09T16:00:00",
        descricao: "Contrato assinado e comissão lançada.",
        responsavelId: "c2",
      },
    ],
    observacoes: "Contrato assinado, comissão lançada",
    criadoEm: "2026-06-09T16:00:00",
  },
  {
    id: "a5",
    clienteId: "cl6",
    imovelId: "im6",
    corretorId: "c4",
    imobiliaria: "morar",
    status: "Em visita",
    observacoes: "Aguardando confirmação do cliente",
    criadoEm: "2026-06-11T08:45:00",
  },
  {
    id: "a6",
    clienteId: "cl4",
    imovelId: "im5",
    corretorId: "c4",
    telefone: "(55) 96666-5555",
    whatsapp: "(55) 96666-5555",
    origem: "Carteira antiga",
    data: "2026-06-05T10:00:00",
    imobiliaria: "morar",
    responsavel: "Camila Reis",
    interesse: "Anunciar",
    tipoImovel: "Cobertura",
    faixaValor: { minimo: 780000, maximo: 820000 },
    bairro: "Centro",
    dormitorios: 4,
    garagem: true,
    patio: false,
    salaComercial: false,
    apartamento: true,
    casa: false,
    terreno: false,
    urgencia: "Média",
    status: "Perdido",
    historico: [
      {
        data: "2026-06-05T10:00:00",
        descricao: "Proprietário recusou exclusividade inicial.",
        responsavelId: "c4",
      },
    ],
    motivoPerda: "Proprietário decidiu aguardar nova avaliação de mercado.",
    observacoes: "Negociação de exclusividade pausada",
    criadoEm: "2026-06-05T10:00:00",
  },
];

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
  categoria: "Comissão" | "Aluguel recebido" | "Repasse" | "Despesa" | "Venda";
  valor: number;
  data: string;
  tipo: "entrada" | "saida";
  imobiliaria: AgencyId;
  status: "Pago" | "Pendente" | "Atrasado";
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
export type CampanhaMarketing = {
  id: string;
  nome: string;
  canal: "Instagram" | "Portais" | "E-mail" | "WhatsApp";
  objetivo: "Leads" | "Visitas" | "Captação";
  investimento: number;
  leads: number;
  status: "Ativa" | "Pausada" | "Planejada";
  imobiliaria: AgencyId;
};

export const campanhasMarketingSeed: CampanhaMarketing[] = [
  {
    id: "mk1",
    nome: "Open house Jardins",
    canal: "Instagram",
    objetivo: "Visitas",
    investimento: 1800,
    leads: 42,
    status: "Ativa",
    imobiliaria: "cordial",
  },
  {
    id: "mk2",
    nome: "Captação proprietários premium",
    canal: "E-mail",
    objetivo: "Captação",
    investimento: 950,
    leads: 18,
    status: "Planejada",
    imobiliaria: "cordial",
  },
  {
    id: "mk3",
    nome: "Casas em condomínio",
    canal: "Portais",
    objetivo: "Leads",
    investimento: 2400,
    leads: 56,
    status: "Ativa",
    imobiliaria: "morar",
  },
  {
    id: "mk4",
    nome: "Remarketing locação",
    canal: "WhatsApp",
    objetivo: "Leads",
    investimento: 620,
    leads: 31,
    status: "Pausada",
    imobiliaria: "morar",
  },
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
  formaPagamento: "À vista" | "Financiamento" | "Consórcio" | "Permuta";
  etapa: "Proposta" | "Documentação" | "Assinatura" | "Registro" | "Concluída" | "Perdida";
  previsaoEscritura: string;
  imobiliaria: AgencyId;
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
