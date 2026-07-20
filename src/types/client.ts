export type ClientPurpose = "compra" | "aluguel" | "ambos" | "venda" | "locacao";

export type ClientType = "comprador" | "locatario" | "proprietario" | "investidor";

export type ContactPreference = "whatsapp" | "ligacao" | "email";

export type LeadOrigin =
  | "whatsapp"
  | "instagram"
  | "indicacao"
  | "site"
  | "portal"
  | "presencial"
  | "outro";

export type RealEstateBrand = "cordial" | "morar" | "ambas";

export type PropertyType =
  | "casa"
  | "apartamento"
  | "terreno"
  | "sala_comercial"
  | "area_rural"
  | "outro";

export type BedroomOption = "1" | "2" | "3" | "4+" | "nao_aplica";

export type ClientStatus =
  | "novo"
  | "em_atendimento"
  | "aguardando_retorno"
  | "visita_agendada"
  | "proposta_enviada"
  | "em_negociacao"
  | "fechado"
  | "perdido"
  | "sem_retorno";

export interface Client {
  id: string;
  createdBy?: string;
  fullName: string;
  phone: string;
  email?: string;
  clientType: ClientType;
  contactPreference: ContactPreference;
  leadOrigin: LeadOrigin;
  brand: RealEstateBrand;
  assignedBrokerId?: string;
  assignedBrokerName?: string;
  purpose: ClientPurpose;
  propertyType: PropertyType;
  bedrooms?: BedroomOption;
  neighborhood?: string;
  minBudget?: number;
  maxBudget?: number;
  approximateIncome?: number;
  document?: string;
  profession?: string;
  notes?: string;
  restrictions?: string;
  nextStep?: string;
  nextFollowUpAt?: string;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
}

export type ClientCreateInput = Omit<Client, "id" | "createdBy" | "createdAt" | "updatedAt">;

export const clientTypeOptions = [
  { value: "comprador", label: "Comprador" },
  { value: "locatario", label: "Locatário" },
  { value: "proprietario", label: "Proprietário" },
  { value: "investidor", label: "Investidor" },
] as const;

export const contactPreferenceOptions = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "ligacao", label: "Ligação" },
  { value: "email", label: "E-mail" },
] as const;

export const leadOriginOptions = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "indicacao", label: "Indicação" },
  { value: "site", label: "Site" },
  { value: "portal", label: "Portal" },
  { value: "presencial", label: "Atendimento presencial" },
  { value: "outro", label: "Outro" },
] as const;

export const realEstateBrandOptions = [
  { value: "cordial", label: "Cordial Imóveis" },
  { value: "morar", label: "Morar Imóveis" },
  { value: "ambas", label: "Ambas" },
] as const;

export const clientPurposeOptions = [
  { value: "compra", label: "Comprar" },
  { value: "aluguel", label: "Alugar" },
  { value: "ambos", label: "Ambos" },
  { value: "venda", label: "Vender (proprietário)" },
  { value: "locacao", label: "Locar (proprietário)" },
] as const;

export const propertyTypeOptions = [
  { value: "casa", label: "Casa" },
  { value: "apartamento", label: "Apartamento" },
  { value: "terreno", label: "Terreno" },
  { value: "sala_comercial", label: "Sala comercial" },
  { value: "area_rural", label: "Área rural" },
  { value: "outro", label: "Outro" },
] as const;

export const bedroomOptions = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4+", label: "4+" },
  { value: "nao_aplica", label: "Não se aplica" },
] as const;

export const clientStatusOptions = [
  { value: "novo", label: "Novo cliente" },
  { value: "em_atendimento", label: "Em atendimento" },
  { value: "aguardando_retorno", label: "Aguardando retorno" },
  { value: "visita_agendada", label: "Visita agendada" },
  { value: "proposta_enviada", label: "Proposta enviada" },
  { value: "em_negociacao", label: "Em negociação" },
  { value: "fechado", label: "Fechado" },
  { value: "perdido", label: "Perdido" },
  { value: "sem_retorno", label: "Sem retorno" },
] as const;

export const brokerOptions = [
  { id: "ricardo", label: "Ricardo" },
  { id: "bruna", label: "Bruna" },
  { id: "bianca", label: "Bianca" },
  { id: "felipe", label: "Felipe" },
  { id: "outro", label: "Outro" },
] as const;

export function optionLabel<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function clientTypeLabel(value: ClientType) {
  return optionLabel(clientTypeOptions, value);
}

export function contactPreferenceLabel(value: ContactPreference) {
  return optionLabel(contactPreferenceOptions, value);
}

export function leadOriginLabel(value: LeadOrigin) {
  return optionLabel(leadOriginOptions, value);
}

export function realEstateBrandLabel(value: RealEstateBrand) {
  return optionLabel(realEstateBrandOptions, value);
}

export function clientPurposeLabel(value: ClientPurpose) {
  return optionLabel(clientPurposeOptions, value);
}

export function propertyTypeLabel(value: PropertyType) {
  return optionLabel(propertyTypeOptions, value);
}

export function bedroomLabel(value?: BedroomOption) {
  if (!value) return "Não informado";
  return optionLabel(bedroomOptions, value);
}

export function clientStatusLabel(value: ClientStatus) {
  return optionLabel(clientStatusOptions, value);
}
