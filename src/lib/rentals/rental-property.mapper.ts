import type {
  RentalBrand,
  RentalProperty,
  RentalPropertyStatus,
  RentalPropertyType,
} from "../../types/rental.ts";

/**
 * Keep the detail/list property projection explicit. Owner fields used to be
 * lost between `rental_properties` and RentalContractFull when this projection
 * and mapper did not include them.
 */
export const RENTAL_PROPERTY_COLUMNS =
  "id,apelido,tipo,logradouro,numero,complemento,bairro,cidade,uf,cep,quartos,banheiros,vagas,area_m2,valor_sugerido,status,observacoes,brand,proprietario_nome,proprietario_cpf,proprietario_email,proprietario_telefone,created_at,updated_at";

export type RentalPropertyRow = {
  id: string;
  apelido: string;
  tipo: string;
  logradouro: string;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
  area_m2: number | null;
  valor_sugerido: number | null;
  status: string;
  observacoes: string | null;
  brand: string;
  proprietario_nome: string | null;
  proprietario_cpf: string | null;
  proprietario_email: string | null;
  proprietario_telefone: string | null;
  created_at: string;
  updated_at: string;
};

export function mapRentalPropertyRow(row: RentalPropertyRow): RentalProperty {
  return {
    id: row.id,
    apelido: row.apelido,
    tipo: row.tipo as RentalPropertyType,
    logradouro: row.logradouro,
    numero: row.numero,
    complemento: row.complemento,
    bairro: row.bairro,
    cidade: row.cidade,
    uf: row.uf,
    cep: row.cep,
    quartos: row.quartos,
    banheiros: row.banheiros,
    vagas: row.vagas,
    areaM2: row.area_m2,
    valorSugerido: row.valor_sugerido,
    status: row.status as RentalPropertyStatus,
    observacoes: row.observacoes,
    brand: row.brand as RentalBrand,
    proprietarioNome: row.proprietario_nome,
    proprietarioCpf: row.proprietario_cpf,
    proprietarioEmail: row.proprietario_email,
    proprietarioTelefone: row.proprietario_telefone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
