/** Pure text match for rental contracts (tenants, co-tenants, owner, guarantors, property). */
export type RentalSearchable = {
  status?: string | null;
  property: {
    apelido?: string | null;
    bairro?: string | null;
    cidade?: string | null;
    logradouro?: string | null;
    proprietarioNome?: string | null;
  };
  tenant?: { nome?: string | null } | null;
  tenants?: Array<{ nome?: string | null } | null> | null;
  guarantor?: { nome?: string | null } | null;
  guarantees?: Array<{ guarantor?: { nome?: string | null } | null } | null> | null;
};

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function matchesRentalSearch(c: RentalSearchable, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hay = normalizeSearch(
    [
      c.property.apelido,
      c.property.bairro,
      c.property.cidade,
      c.property.logradouro,
      c.property.proprietarioNome,
      c.tenant?.nome,
      ...(c.tenants ?? []).map((t) => t?.nome),
      c.guarantor?.nome,
      ...(c.guarantees ?? []).map((g) => g?.guarantor?.nome),
      c.status,
    ]
      .filter(Boolean)
      .join(" "),
  );
  return q.split(/\s+/).every((word) => hay.includes(word));
}
