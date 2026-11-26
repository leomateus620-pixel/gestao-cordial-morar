/**
 * Server-side read of a contract's entry-inspection situation. The contract is
 * read through the caller's own access rules (RLS), so this never widens who may
 * see a contract; it only answers "may the entry inspection start, and has it
 * already started?".
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  entryInspectionGate,
  exitInspectionGate,
  type ExitInspectionMissing,
  type RentalInspectionKind,
  type EntryInspectionDocument,
  type EntryInspectionMissing,
} from "./entry-inspection";

type Client = SupabaseClient<Database>;

export async function assertRentalWorkflowAccess(supabase: Client, id: string, draft = false) {
  const { data, error } = await supabase.rpc(
    "rental_workflow_can_operate" as never,
    {
      p_id: id,
      p_draft: draft,
    } as never,
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Aluguel não encontrado ou sem acesso à imobiliária.");
}

export async function readRentalDataRevision(supabase: Client, id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc(
    "rental_contract_data_revision" as never,
    {
      p_id: id,
    } as never,
  );
  if (error) throw new Error(error.message);
  return typeof data === "string" ? data : null;
}

export type ContractEntryInspectionState = {
  contractId: string;
  rentalPropertyId: string;
  brand: "cordial" | "morar" | "ambas";
  modelBrand: "cordial" | "morar" | undefined;
  unlocked: boolean;
  reviewedAt: string | null;
  missing: EntryInspectionMissing | null;
  existingInspectionId: string | null;
  existingInspectionStatus: string | null;
  entryHasDocument: boolean;
  exitUnlocked: boolean;
  exitMissing: ExitInspectionMissing | null;
  exitInspectionId: string | null;
  exitInspectionStatus: string | null;
  exitHasDocument: boolean;
  /** Só nomes/tipos dos cômodos da entrada, para sugerir na saída. */
  entryRooms: { name: string; kind: string }[];
};

export async function loadContractEntryInspectionState(
  supabase: Client,
  contractId: string,
): Promise<ContractEntryInspectionState> {
  await assertRentalWorkflowAccess(supabase, contractId);
  const { data: contract, error: contractError } = await supabase
    .from("rental_contracts")
    .select("id,property_id,brand,template_options" as "id,property_id,brand")
    .eq("id", contractId)
    .maybeSingle();
  if (contractError) throw new Error(contractError.message);
  if (!contract) throw new Error("Contrato não encontrado.");

  const [
    { data: documentRows, error: documentError },
    { data: inspectionRows, error: inspectionError },
    revision,
  ] = await Promise.all([
    supabase
      .from("rental_contract_documents")
      .select("id,category,reviewed_at,review_revision" as "id,category,reviewed_at")
      .eq("contract_id", contractId),
    supabase
      .from("inspections")
      .select("id,status,rental_kind,current_version")
      .eq("rental_contract_id", contractId)
      .in("rental_kind", ["entrada", "saida"])
      .order("created_at"),
    readRentalDataRevision(supabase, contractId),
  ]);
  if (documentError) throw new Error(documentError.message);
  if (inspectionError) throw new Error(inspectionError.message);

  const documents: EntryInspectionDocument[] = (documentRows ?? []).map((row) => ({
    id: String(row.id),
    category: String(row.category ?? "outro"),
    reviewedAt:
      revision && (row as typeof row & { review_revision?: string }).review_revision === revision
        ? row.reviewed_at
        : null,
  }));
  const gate = entryInspectionGate(documents);
  const rows = inspectionRows ?? [];
  const existing = rows.find((r) => r.rental_kind === "entrada");
  const exit = rows.find((r) => r.rental_kind === "saida");
  const ids = [existing?.id, exit?.id].filter(Boolean) as string[];
  const withDoc = new Set<string>();
  if (ids.length) {
    const { data: docs, error: docErr } = await supabase
      .from("inspection_documents")
      .select("inspection_id,version")
      .in("inspection_id", ids);
    if (docErr) throw new Error(docErr.message);
    for (const d of docs ?? []) {
      if (rows.some((row) => row.id === d.inspection_id && row.current_version === d.version))
        withDoc.add(d.inspection_id);
    }
  }
  let entryRooms: { name: string; kind: string }[] = [];
  if (existing) {
    const { data: rr, error: rrErr } = await supabase
      .from("inspection_rooms")
      .select("name,kind,position")
      .eq("inspection_id", existing.id)
      .order("position");
    if (rrErr) throw new Error(rrErr.message);
    entryRooms = (rr ?? []).map((r) => ({ name: String(r.name), kind: String(r.kind) }));
  }
  const entryHasDocument = existing ? withDoc.has(String(existing.id)) : false;
  const exitGate = exitInspectionGate({
    id: existing ? String(existing.id) : null,
    status: existing ? String(existing.status) : null,
    hasDocument: entryHasDocument,
  });

  return {
    contractId,
    rentalPropertyId: String(contract.property_id),
    brand: contract.brand,
    modelBrand: (
      contract as typeof contract & { template_options?: { modelBrand?: "cordial" | "morar" } }
    ).template_options?.modelBrand,
    unlocked: gate.unlocked,
    reviewedAt: gate.reviewedAt,
    missing: gate.missing,
    existingInspectionId: existing ? String(existing.id) : null,
    existingInspectionStatus: existing ? String(existing.status) : null,
    entryHasDocument,
    exitUnlocked: exitGate.unlocked,
    exitMissing: exitGate.missing,
    exitInspectionId: exit ? String(exit.id) : null,
    exitInspectionStatus: exit ? String(exit.status) : null,
    exitHasDocument: exit ? withDoc.has(String(exit.id)) : false,
    entryRooms,
  };
}

/**
 * Guard used when a vistoria is created from a contract: the contract must be
 * visible to the caller, its attached contract document must be reviewed, and no
 * entry inspection may exist yet.
 */
export async function assertContractEntryInspectionStart(
  supabase: Client,
  contractId: string,
  kind: RentalInspectionKind = "entrada",
): Promise<ContractEntryInspectionState> {
  const state = await loadContractEntryInspectionState(supabase, contractId);
  if (kind === "saida") {
    if (state.exitInspectionId) return state;
    if (!state.exitUnlocked)
      throw new Error(
        "A vistoria de saída só é liberada depois da entrada concluída com o termo registrado.",
      );
    return state;
  }
  if (state.existingInspectionId) return state;
  if (!state.unlocked) {
    throw new Error(
      state.missing === "no_contract_document"
        ? "Anexe o contrato de aluguel e marque como conferido antes de iniciar a vistoria de entrada."
        : "Marque o contrato anexado como conferido antes de iniciar a vistoria de entrada.",
    );
  }
  return state;
}

/**
 * The contract's own rental property, shaped like a catalog property so the
 * inspection screens keep working unchanged. The contract itself is read with
 * the caller's access rules; the property row is read with a privileged client
 * passed by the caller, so the rental-property table stays closed to the browser.
 */
export type ContractInspectionProperty = {
  id: string;
  tipo: string | null;
  codigo: string | null;
  codigo_cordial: string | null;
  codigo_morar: string | null;
  carteira: string | null;
  finalidade: string | null;
  operacao: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  dormitorios: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  salas: number | null;
  mobiliado: string | null;
  area_total: number | null;
  area_construida: number | null;
  nome_condominio: string | null;
  brand: string | null;
  owner: string | null;
};

const RENTAL_PROPERTY_COLS =
  "id,tipo,logradouro,numero,complemento,bairro,cidade,uf,cep,quartos,banheiros,vagas,area_m2,brand,proprietario_nome";

export async function loadContractInspectionProperty(
  privileged: Client,
  rentalPropertyId: string,
): Promise<ContractInspectionProperty> {
  const { data: row, error } = await privileged
    .from("rental_properties")
    .select(RENTAL_PROPERTY_COLS)
    .eq("id", rentalPropertyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("O imóvel do contrato não foi encontrado.");

  const brand = String(row.brand ?? "");
  const area = row.area_m2 == null ? null : Number(row.area_m2);
  return {
    id: String(row.id),
    tipo: row.tipo ? String(row.tipo) : null,
    codigo: null,
    codigo_cordial: null,
    codigo_morar: null,
    carteira: null,
    finalidade: "locacao",
    operacao: "locacao",
    logradouro: row.logradouro ? String(row.logradouro) : null,
    numero: row.numero ? String(row.numero) : null,
    complemento: row.complemento ? String(row.complemento) : null,
    bairro: row.bairro ? String(row.bairro) : null,
    cidade: row.cidade ? String(row.cidade) : null,
    uf: row.uf ? String(row.uf) : null,
    cep: row.cep ? String(row.cep) : null,
    dormitorios: row.quartos == null ? null : Number(row.quartos),
    suites: null,
    banheiros: row.banheiros == null ? null : Number(row.banheiros),
    vagas: row.vagas == null ? null : Number(row.vagas),
    salas: null,
    mobiliado: null,
    area_total: Number.isFinite(area as number) ? area : null,
    area_construida: null,
    nome_condominio: null,
    brand: brand || null,
    owner: row.proprietario_nome ? String(row.proprietario_nome) : null,
  };
}
