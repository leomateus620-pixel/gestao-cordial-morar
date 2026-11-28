import { propertyFamily, type Meters } from "./model";
import type { InspectionData, NoteRow, RentalTermParty } from "./types";

export const CONDITIONS = {
  pintura: "Pintura",
  fechaduras: "Trincos e fechaduras",
  eletrica: "Parte elétrica",
  hidraulica: "Parte hidráulica",
  pisos: "Pisos e azulejos",
  janelas: "Vidraças e janelas",
} as const;
export const CONDITION_KEYS = Object.keys(CONDITIONS) as [
  keyof typeof CONDITIONS,
  ...(keyof typeof CONDITIONS)[],
];

export type TermParty = { role: "Locador" | "Locatário"; name: string; qualification: string };
export type TermBrand = "cordial" | "morar";
const isBrand = (s: unknown): s is TermBrand => s === "cordial" || s === "morar";
export const isRentalTerm = (kind: string) => kind === "entrada" || kind === "saida";

export function reviewedTermText(note: NoteRow) {
  if (note.status !== "revisado") return "";
  return (
    note.approved_text?.trim() ||
    (note.source === "texto" ? note.transcript_original?.trim() : "") ||
    ""
  );
}

export function inspectionTerm(full: InspectionData) {
  const i = full.inspection,
    contract = full.termRental;
  const issues: string[] = [];
  let brand: TermBrand | null = isBrand(i.agency) ? i.agency : null;
  const parties: TermParty[] = [];
  const addRentalParty = (p: RentalTermParty, role: TermParty["role"], index: number) => {
    const name = p.name?.trim() ?? "";
    const fields = {
      nome: name,
      "CPF/CNPJ": p.document,
      nacionalidade: p.details?.nationality,
      "estado civil": p.details?.maritalStatus,
      profissão: p.details?.profession || p.profession,
      RG: p.details?.rg,
      "endereço residencial": p.details?.address || p.address,
    };
    const missing = Object.entries(fields)
      .filter(([, value]) => !value?.trim())
      .map(([key]) => key);
    if (missing.length)
      issues.push(`Aluguéis → Partes → ${role} ${index + 1}: preencher ${missing.join(", ")}.`);
    const qualification = [
      fields.nacionalidade,
      fields["estado civil"],
      fields.profissão,
      p.document && `CPF/CNPJ nº ${p.document}`,
      fields.RG && `RG nº ${fields.RG}`,
      fields["endereço residencial"] &&
        `residente e domiciliado(a) na ${fields["endereço residencial"]}`,
    ]
      .filter(Boolean)
      .join(", ");
    parties.push({ name, role, qualification });
  };
  if (i.rental_contract_id) {
    const linkedBrand = contract?.brand === "ambas" ? contract.modelBrand : contract?.brand;
    if (
      !contract ||
      contract.id !== i.rental_contract_id ||
      contract.propertyId !== i.rental_property_id ||
      i.rental_kind !== i.kind ||
      !isBrand(linkedBrand) ||
      linkedBrand !== i.agency ||
      (contract.modelBrand && contract.modelBrand !== linkedBrand)
    ) {
      issues.push(
        "Aluguéis → Vistorias: confira o contrato, o imóvel e a imobiliária do modelo vinculados a esta vistoria.",
      );
      brand = null;
    } else {
      contract.owners.forEach((p, n) => addRentalParty(p, "Locador", n));
      contract.tenants.forEach((p, n) => addRentalParty(p, "Locatário", n));
    }
  } else {
    if (!brand) issues.push("Dados da vistoria: confirme a imobiliária responsável.");
    for (const p of i.participants ?? []) {
      const role = /^(locador(a)?|proprietári[oa])$/i.test(p.papel.trim())
        ? "Locador"
        : /^(locatári[oa]|inquilin[oa])$/i.test(p.papel.trim())
          ? "Locatário"
          : null;
      if (role) {
        if (!p.qualificacao?.trim())
          issues.push(`Dados → Participantes: preencha a qualificação de ${p.nome}.`);
        parties.push({ role, name: p.nome, qualification: p.qualificacao?.trim() ?? "" });
      }
    }
  }
  if (brand)
    for (const role of ["Locador", "Locatário"] as const) {
      if (!parties.some((p) => p.role === role))
        issues.push(
          `${i.rental_contract_id ? "Aluguéis → Partes" : "Dados → Participantes"}: informe o ${role.toLowerCase()} e sua qualificação.`,
        );
    }

  const cad = i.property_snapshot?.cadastro,
    conf = i.property_snapshot?.confirmado;
  const family = propertyFamily(conf?.tipo || cad?.tipo);
  const purpose =
    i.term_purpose ||
    (family === "comercial"
      ? "comercial"
      : family === "apartamento" || family === "casa"
        ? "residencial"
        : null);
  const city = i.term_city?.trim() || conf?.cidade?.trim() || cad?.cidade?.trim() || "";
  if (!purpose) issues.push("Dados → Destinação: indique o uso residencial ou comercial.");
  if (!city) issues.push("Dados → Município do termo: preencha o município.");
  const address = i.property_snapshot?.endereco?.trim() || i.term_address?.trim() || "";
  if (!address) issues.push("Dados → Endereço do imóvel vistoriado: preencha o endereço.");
  if (!i.inspected_at) issues.push("Dados → Data e hora: registre a data da vistoria.");
  if (brand && purpose && (purpose !== "residencial" || i.kind !== "entrada"))
    issues.push(
      `Redação institucional pendente de aprovação para ${brand === "morar" ? "Morar" : "Cordial"}: vistoria de ${i.kind === "saida" ? "saída" : "entrada"} ${purpose}.`,
    );
  for (const [key, meter] of Object.entries(i.meters ?? {}) as [
    keyof Meters,
    Meters[keyof Meters],
  ][]) {
    if (meter.status === "informado" && !meter.reading?.trim())
      issues.push(
        `Dados → Medidores: informe a leitura de ${{ agua: "água", luz: "luz", gas: "gás" }[key]}.`,
      );
  }
  for (const r of full.rooms) {
    const hasText = full.notes.some((n) => n.room_id === r.id && reviewedTermText(n));
    const hasAssessment = full.items.some(
      (item) => item.room_id === r.id && item.state !== "pendente",
    );
    if (!hasText && !hasAssessment)
      issues.push(
        `Cômodos → ${r.name}: registre a descrição do ambiente ou o motivo que impediu a vistoria e revise o relato.`,
      );
  }
  return { brand, address, purpose, city, parties, issues, conditions: i.term_conditions ?? {} };
}
export type InspectionTerm = ReturnType<typeof inspectionTerm>;
