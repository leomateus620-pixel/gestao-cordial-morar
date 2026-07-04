import type { AgencyId, ImovelTipo } from "@/lib/mock/data";

export type SaleStatus = "concluida" | "aguardando_assinatura" | "em_analise" | "cancelada";

export type SaleDocumentStatus =
  | "contrato_anexado"
  | "contrato_pendente"
  | "aguardando_assinatura"
  | "em_analise"
  | "cancelado";

export type SalePaymentMethod =
  | "À vista"
  | "Financiamento"
  | "Consórcio"
  | "Permuta"
  | "Parcelado"
  | "Outro";

export type SalePropertyType = ImovelTipo | "Fazenda" | "Outro";

export type SaleRecord = {
  id: string;
  propertyId?: string;
  propertyName: string;
  propertyAddress: string;
  propertyNeighborhood?: string;
  propertyCityState?: string;
  propertyType: SalePropertyType;
  bedrooms?: number;
  bathrooms?: number;
  areaM2?: number;
  previousAskingPrice?: number;
  buyerName: string;
  buyerDocument?: string;
  buyerPhone?: string;
  buyerEmail?: string;
  buyerAddress?: string;
  buyerObservations?: string;
  saleValue: number;
  saleDate: string;
  saleStatus: SaleStatus;
  paymentMethod: SalePaymentMethod;
  paymentDetails?: string;
  commissionValue?: number;
  commissionPercentage?: number;
  responsibleAgent?: string;
  contractFileUrl?: string;
  contractFileName?: string;
  supportingDocumentFileName?: string;
  documentStatus: SaleDocumentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  imobiliaria: AgencyId;
};

export type SaleRecordInput = Omit<SaleRecord, "id" | "createdAt" | "updatedAt">;

export type SalesKpis = {
  totalSold: number;
  registeredSales: number;
  attachedContracts: number;
  averageTicket: number;
  monthSales: number;
  documentPendencies: number;
};

export type SalesFilter =
  | "todos"
  | "mes"
  | "com_contrato"
  | "sem_contrato"
  | "maior_valor"
  | "recentes"
  | "concluidas"
  | "em_analise";
