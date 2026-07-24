import assert from "node:assert/strict";
import test from "node:test";
import {
  RENTAL_PROPERTY_COLUMNS,
  mapRentalPropertyRow,
  type RentalPropertyRow,
} from "./rental-property.mapper.ts";
import { formatRentalDate, hasRentalOwnerData } from "./rental-detail.utils.ts";

const row: RentalPropertyRow = {
  id: "property-1",
  apelido: "Residencial Cordial",
  tipo: "apartamento",
  logradouro: "Rua das Flores",
  numero: "120",
  complemento: "Apto 302",
  bairro: "Centro",
  cidade: "Santa Rosa",
  uf: "RS",
  cep: "98780-000",
  quartos: 2,
  banheiros: 1,
  vagas: 1,
  area_m2: 72,
  valor_sugerido: 1850,
  status: "alugado",
  observacoes: null,
  brand: "cordial",
  proprietario_nome: "Maria Proprietária",
  proprietario_cpf: "123.456.789-00",
  proprietario_email: "maria@example.com",
  proprietario_telefone: "(55) 99999-0000",
  created_at: "2026-07-20T12:00:00.000Z",
  updated_at: "2026-07-21T12:00:00.000Z",
};

test("the rental property query explicitly requests every owner field", () => {
  const columns = new Set(RENTAL_PROPERTY_COLUMNS.split(","));

  assert.deepEqual(
    ["proprietario_nome", "proprietario_cpf", "proprietario_email", "proprietario_telefone"].filter(
      (column) => !columns.has(column),
    ),
    [],
  );
});

test("maps complete owner data into the property shared by detail and edit flows", () => {
  const property = mapRentalPropertyRow(row);

  assert.deepEqual(
    {
      nome: property.proprietarioNome,
      cpfCnpj: property.proprietarioCpf,
      telefone: property.proprietarioTelefone,
      email: property.proprietarioEmail,
    },
    {
      nome: "Maria Proprietária",
      cpfCnpj: "123.456.789-00",
      telefone: "(55) 99999-0000",
      email: "maria@example.com",
    },
  );
  assert.equal(hasRentalOwnerData(property), true);
});

test("formats contract dates without shifting date-only values across time zones", () => {
  assert.equal(formatRentalDate("2026-07-03"), "03/07/2026");
  assert.equal(formatRentalDate("2026-07-03T00:00:00.000Z"), "03/07/2026");
});
