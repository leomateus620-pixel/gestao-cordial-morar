import type { AgencyId, ImovelTipo } from "@/lib/mock/data";

export type SaleStatus = "concluida" | "aguardando_assinatura" | "em_analise" | "cancelada";

export type SaleDocumentStatus =
  "contrato_anexado" | "contrato_pendente" | "aguardando_assinatura" | "em_analise" | "cancelado";

export type SalePaymentMethod =
  "À vista" | "Financiamento" | "Consórcio" | "Permuta" | "Parcelado" | "Outro";

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
  ownerId?: string;
  ownerName?: string;
  ownerInitials?: string;

  contractFilePath?: string;
  contractFileUrl?: string;
  contractFileName?: string;
  supportingDocumentFileName?: string;
  documentStatus: SaleDocumentStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  imobiliaria: AgencyId;
  payments?: SalePayment[];
  attachments?: SaleAttachment[];
};

export type SaleAttachment = {
  id: string;
  saleId: string;
  fileName: string;
  filePath: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
};

export type SalePaymentKind = "entrada" | "parcela";

export type SalePayment = {
  id: string;
  saleId: string;
  kind: SalePaymentKind;
  sequence: number;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt?: string | null;
  notifiedAt?: string | null;
};

export type SalePaymentInput = {
  kind: SalePaymentKind;
  sequence?: number;
  amount: number;
  dueDate: string;
  paid?: boolean;
};

export type SaleRecordInput = Omit<
  SaleRecord,
  "id" | "createdAt" | "updatedAt" | "ownerId" | "ownerName" | "ownerInitials" | "payments"
> & { payments?: SalePaymentInput[] };

export type SalesKpis = {
  totalSold: number;
  registeredSales: number;
  attachedContracts: number;
  averageTicket: number;
  monthSales: number;
  documentPendencies: number;
};

export type SalesStatusFilter = "todos" | "concluidas" | "em_analise";

export type SalesPeriodFilter = "todos" | "mes";

export type SalesContractFilter = "todos" | "com_contrato" | "sem_contrato";

export type SalesSort = "recentes" | "maior_valor";

export type SalesFiltersState = {
  status: SalesStatusFilter;
  period: SalesPeriodFilter;
  contract: SalesContractFilter;
  sort: SalesSort;
};

export const DEFAULT_SALES_FILTERS: SalesFiltersState = {
  status: "todos",
  period: "todos",
  contract: "todos",
  sort: "recentes",
};
