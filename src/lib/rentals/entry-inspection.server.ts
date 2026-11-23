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
  type EntryInspectionDocument,
  type EntryInspectionMissing,
} from "./entry-inspection";

type Client = SupabaseClient<Database>;

export type ContractEntryInspectionState = {
  contractId: string;
  propertyId: string;
  unlocked: boolean;
  reviewedAt: string | null;
  missing: EntryInspectionMissing | null;
  existingInspectionId: string | null;
  existingInspectionStatus: string | null;
};

export async function loadContractEntryInspectionState(
  supabase: Client,
  contractId: string,
): Promise<ContractEntryInspectionState> {
  const { data: contract, error: contractError } = await supabase
    .from("rental_contracts")
    .select("id,property_id")
    .eq("id", contractId)
    .maybeSingle();
  if (contractError) throw new Error(contractError.message);
  if (!contract) throw new Error("Contrato não encontrado.");

  const [{ data: documentRows, error: documentError }, { data: inspectionRows, error: inspectionError }] =
    await Promise.all([
      supabase
        .from("rental_contract_documents")
        .select("id,category,reviewed_at")
        .eq("contract_id", contractId),
      supabase
        .from("inspections")
        .select("id,status")
        .eq("rental_contract_id", contractId)
        .eq("rental_kind", "entrada")
        .order("created_at")
        .limit(1),
    ]);
  if (documentError) throw new Error(documentError.message);
  if (inspectionError) throw new Error(inspectionError.message);

  const documents: EntryInspectionDocument[] = (documentRows ?? []).map((row) => ({
    id: String(row.id),
    category: String(row.category ?? "outro"),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
  }));
  const gate = entryInspectionGate(documents);
  const existing = (inspectionRows ?? [])[0];

  return {
    contractId,
    propertyId: String(contract.property_id),
    unlocked: gate.unlocked,
    reviewedAt: gate.reviewedAt,
    missing: gate.missing,
    existingInspectionId: existing ? String(existing.id) : null,
    existingInspectionStatus: existing ? String(existing.status) : null,
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
): Promise<ContractEntryInspectionState> {
  const state = await loadContractEntryInspectionState(supabase, contractId);
  if (state.existingInspectionId) {
    throw new Error(
      "Este contrato já tem uma vistoria de entrada. Abra a vistoria existente em vez de criar outra.",
    );
  }
  if (!state.unlocked) {
    throw new Error(
      state.missing === "no_contract_document"
        ? "Anexe o contrato de aluguel e marque como conferido antes de iniciar a vistoria de entrada."
        : "Marque o contrato anexado como conferido antes de iniciar a vistoria de entrada.",
    );
  }
  return state;
}
