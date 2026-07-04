import type { Cliente, Contrato, Corretor, Imovel, Venda } from "@/lib/mock/data";
import type {
  SaleDocumentStatus,
  SalePaymentMethod,
  SalePropertyType,
  SaleRecord,
  SaleRecordInput,
  SaleStatus,
  SalesKpis,
} from "@/types/sale";

type SaleRelations = {
  vendas: Venda[];
  imoveis: Imovel[];
  contratos: Contrato[];
  clientes: Cliente[];
  corretores: Corretor[];
};

type UpsertOptions = {
  id?: string;
  createdAt?: string;
};

const fallbackDate = () => new Date().toISOString().slice(0, 10);

const legacyPaymentMap: Record<string, SalePaymentMethod> = {
  "À vista": "À vista",
  Financiamento: "Financiamento",
  Consórcio: "Consórcio",
  Permuta: "Permuta",
  Parcelado: "Parcelado",
  Outro: "Outro",
};

function createId() {
  return `vd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function asSalePaymentMethod(value?: string): SalePaymentMethod {
  return value && legacyPaymentMap[value] ? legacyPaymentMap[value] : "Financiamento";
}

function inferSaleStatus(venda: Venda, contrato?: Contrato): SaleStatus {
  if (venda.saleStatus) return venda.saleStatus;
  if (venda.etapa === "Perdida") return "cancelada";
  if (venda.etapa === "Concluída" || contrato?.status === "Ativo") return "concluida";
  if (venda.etapa === "Assinatura" || contrato?.status === "Pendente assinatura") {
    return "aguardando_assinatura";
  }
  return "em_analise";
}

function inferDocumentStatus(venda: Venda, contrato?: Contrato): SaleDocumentStatus {
  if (venda.documentStatus) return venda.documentStatus;
  if (venda.saleStatus === "cancelada" || venda.etapa === "Perdida") return "cancelado";
  if (venda.contractFileName || contrato?.documentos?.length) return "contrato_anexado";
  if (contrato?.status === "Pendente assinatura" || venda.etapa === "Assinatura") {
    return "aguardando_assinatura";
  }
  if (venda.etapa === "Documentação" || venda.etapa === "Registro") return "em_analise";
  return "contrato_pendente";
}

function toLegacyStage(status: SaleStatus, documentStatus: SaleDocumentStatus): Venda["etapa"] {
  if (status === "cancelada") return "Perdida";
  if (status === "concluida") return "Concluída";
  if (documentStatus === "aguardando_assinatura") return "Assinatura";
  if (documentStatus === "em_analise") return "Registro";
  return "Documentação";
}

function findById<T extends { id: string }>(items: T[], id?: string) {
  return id ? items.find((item) => item.id === id) : undefined;
}

function clienteName(cliente?: Cliente) {
  if (!cliente) return undefined;
  return cliente.nome || cliente.fullName;
}

function clientePhone(cliente?: Cliente) {
  if (!cliente) return undefined;
  return cliente.telefone || cliente.phone || cliente.whatsapp;
}

function clienteAddress(cliente?: Cliente) {
  if (!cliente) return undefined;
  return cliente.endereco || cliente.address;
}

export function createVendaRecord(input: SaleRecordInput, options?: UpsertOptions): Venda {
  const now = new Date().toISOString();
  return {
    id: options?.id ?? createId(),
    clienteId: "",
    imovelId: input.propertyId ?? "",
    valorVenda: input.saleValue,
    comissaoPercentual: input.commissionPercentage ?? 0,
    sinal: 0,
    formaPagamento: input.paymentMethod,
    etapa: toLegacyStage(input.saleStatus, input.documentStatus),
    previsaoEscritura: input.saleDate,
    imobiliaria: input.imobiliaria,
    propertyName: input.propertyName,
    propertyAddress: input.propertyAddress,
    propertyNeighborhood: input.propertyNeighborhood,
    propertyCityState: input.propertyCityState,
    propertyType: input.propertyType,
    bedrooms: input.bedrooms,
    bathrooms: input.bathrooms,
    areaM2: input.areaM2,
    previousAskingPrice: input.previousAskingPrice,
    buyerName: input.buyerName,
    buyerDocument: input.buyerDocument,
    buyerPhone: input.buyerPhone,
    buyerEmail: input.buyerEmail,
    buyerAddress: input.buyerAddress,
    buyerObservations: input.buyerObservations,
    saleDate: input.saleDate,
    saleStatus: input.saleStatus,
    paymentMethod: input.paymentMethod,
    paymentDetails: input.paymentDetails,
    commissionValue: input.commissionValue,
    commissionPercentage: input.commissionPercentage,
    responsibleAgent: input.responsibleAgent,
    contractFileUrl: input.contractFileUrl,
    contractFileName: input.contractFileName,
    supportingDocumentFileName: input.supportingDocumentFileName,
    documentStatus: input.documentStatus,
    notes: input.notes,
    createdAt: options?.createdAt ?? now,
    updatedAt: now,
  };
}

export function buildSaleRecords({
  vendas,
  imoveis,
  contratos,
  clientes,
  corretores,
}: SaleRelations): SaleRecord[] {
  return vendas.map((venda) => {
    const contrato = findById(contratos, venda.contratoId);
    const imovel = findById(imoveis, venda.imovelId || contrato?.imovelId);
    const cliente = findById(clientes, venda.clienteId || contrato?.clienteId);
    const corretor = findById(corretores, contrato?.corretorId);
    const saleDate =
      venda.saleDate || contrato?.inicio || venda.previsaoEscritura || fallbackDate();
    const saleStatus = inferSaleStatus(venda, contrato);
    const documentStatus = inferDocumentStatus(venda, contrato);
    const contractFileName = venda.contractFileName || contrato?.documentos?.[0];

    return {
      id: venda.id,
      propertyId: venda.imovelId || contrato?.imovelId || undefined,
      propertyName: venda.propertyName || imovel?.titulo || "Imóvel não identificado",
      propertyAddress: venda.propertyAddress || imovel?.endereco || "Endereço não informado",
      propertyNeighborhood: venda.propertyNeighborhood || imovel?.bairro,
      propertyCityState: venda.propertyCityState || imovel?.cidade,
      propertyType: (venda.propertyType || imovel?.tipo || "Outro") as SalePropertyType,
      bedrooms: venda.bedrooms ?? imovel?.quartos,
      bathrooms: venda.bathrooms ?? imovel?.banheiros,
      areaM2: venda.areaM2 ?? imovel?.area,
      previousAskingPrice: venda.previousAskingPrice ?? imovel?.valorVenda ?? imovel?.valor,
      buyerName: venda.buyerName || clienteName(cliente) || "Comprador não informado",
      buyerDocument: venda.buyerDocument || cliente?.documento,
      buyerPhone: venda.buyerPhone || clientePhone(cliente),
      buyerEmail: venda.buyerEmail || cliente?.email,
      buyerAddress: venda.buyerAddress || clienteAddress(cliente),
      buyerObservations: venda.buyerObservations || cliente?.observacoes,
      saleValue: venda.valorVenda,
      saleDate,
      saleStatus,
      paymentMethod: venda.paymentMethod || asSalePaymentMethod(venda.formaPagamento),
      paymentDetails: venda.paymentDetails,
      commissionValue:
        venda.commissionValue ??
        (venda.comissaoPercentual
          ? (venda.valorVenda * venda.comissaoPercentual) / 100
          : undefined),
      commissionPercentage: venda.commissionPercentage ?? venda.comissaoPercentual,
      responsibleAgent: venda.responsibleAgent || corretor?.nome,
      contractFileUrl: venda.contractFileUrl,
      contractFileName,
      supportingDocumentFileName: venda.supportingDocumentFileName,
      documentStatus,
      notes: venda.notes,
      createdAt: venda.createdAt || saleDate,
      updatedAt: venda.updatedAt || saleDate,
      imobiliaria: venda.imobiliaria,
    };
  });
}

export function getSalesKpis(records: SaleRecord[], referenceDate = new Date()): SalesKpis {
  const activeRecords = records.filter((sale) => sale.saleStatus !== "cancelada");
  const totalSold = activeRecords.reduce((total, sale) => total + sale.saleValue, 0);
  const attachedContracts = records.filter(
    (sale) => sale.documentStatus === "contrato_anexado",
  ).length;
  const documentPendencies = records.filter(
    (sale) =>
      sale.documentStatus === "contrato_pendente" ||
      sale.documentStatus === "aguardando_assinatura" ||
      sale.documentStatus === "em_analise",
  ).length;
  const monthSales = activeRecords.filter((sale) => {
    const date = new Date(`${sale.saleDate}T12:00:00`);
    return (
      date.getFullYear() === referenceDate.getFullYear() &&
      date.getMonth() === referenceDate.getMonth()
    );
  }).length;

  return {
    totalSold,
    registeredSales: records.length,
    attachedContracts,
    averageTicket: activeRecords.length ? totalSold / activeRecords.length : 0,
    monthSales,
    documentPendencies,
  };
}

export function cancelSaleRecord(venda: Venda): Venda {
  return {
    ...venda,
    etapa: "Perdida",
    saleStatus: "cancelada",
    documentStatus: "cancelado",
    updatedAt: new Date().toISOString(),
  };
}
