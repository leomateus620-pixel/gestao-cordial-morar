export type ScopedBrokerOption = {
  id: string;
  nome: string;
  agencies?: Array<"cordial" | "morar">;
};

export function brokerCanServeAgency(
  broker: ScopedBrokerOption,
  agency: string | null | undefined,
): boolean {
  const memberships = broker.agencies ?? [];
  if (agency === "ambas") return memberships.length > 0;
  if (agency !== "cordial" && agency !== "morar") return false;
  return memberships.includes(agency);
}
