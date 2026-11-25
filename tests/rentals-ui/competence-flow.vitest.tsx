import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";

const seen = vi.hoisted(() => ({ emissions: [] as string[], nf: [] as (string | undefined)[] }));

vi.mock("@/components/alugueis/RentalEmissions", () => ({
  RentalEmissions: (p: { competencia: string; onNf: () => void }) => {
    seen.emissions.push(p.competencia);
    return <button onClick={p.onNf}>Emitir NF</button>;
  },
}));
vi.mock("@/components/alugueis/RentalNfseSection", () => ({
  RentalNfseSection: (p: { emissionRequest?: { competencia: string } }) => {
    seen.nf.push(p.emissionRequest?.competencia);
    return <div data-testid="nf">{p.emissionRequest?.competencia ?? ""}</div>;
  },
}));
vi.mock("@/components/alugueis/RentalDocuments", () => ({ RentalDocuments: () => null }));
vi.mock("@/components/alugueis/RentalContractGenerator", () => ({ RentalContractWorkflow: () => null }));
vi.mock("@/components/alugueis/RentalEntryInspection", () => ({ RentalEntryInspection: () => null }));
vi.mock("@/lib/auth-mock", () => ({ useSession: () => ({ id: "u", role: "admin", roles: ["admin"] }) }));
vi.mock("@/lib/access-control", async (orig) => ({ ...(await orig<object>()), canSeeFinancialInsights: () => true }));

import { RentalExpandedDetails } from "@/components/alugueis/RentalExpandedDetails";
import { effectiveCompetence, parseCompetenciaParam } from "@/lib/rentals/competence-nav";
import { buildCompetenceBadges, countPending } from "@/lib/rentals/competence-status";
import type { RentalContractFull } from "@/types/rental";

const ts = "2026-01-01T00:00:00Z";
const contract = {
  id: "c1", propertyId: "p1", tenantId: "t1", valorMensal: 1500, garantiaTipo: "seguro_fianca",
  dataInicio: "2026-01-01", dataFim: "2027-01-01", diaVencimento: 10, status: "ativo",
  paymentStatus: "em_dia", brand: "morar", createdAt: ts, updatedAt: ts,
  property: { id: "p1", apelido: "Casa", tipo: "casa", logradouro: "Rua A", status: "alugado", brand: "morar", createdAt: ts, updatedAt: ts },
  tenant: { id: "t1", nome: "Ana", telefone: "47999999999", createdAt: ts, updatedAt: ts },
  tenants: [{ id: "t1", nome: "Ana", telefone: "47999999999", createdAt: ts, updatedAt: ts }],
  guarantees: [],
} as unknown as RentalContractFull;

/** Simula a página: competência vem da URL e a pastinha a altera pelo mesmo estado. */
function Page({ url }: { url: string }) {
  const [comp, setComp] = useState(effectiveCompetence(parseCompetenciaParam(url)));
  const noop = () => {};
  return (
    <RentalExpandedDetails contract={contract} open onOpenChange={noop} onClose={noop} onRenew={noop}
      onMarkPaid={noop} onDelete={noop} competencia={comp} onCompetenciaChange={setComp} />
  );
}

afterEach(() => { cleanup(); seen.emissions.length = 0; seen.nf.length = 0; });

describe("competência única até a NF", () => {
  it("competência da URL chega igual em RentalEmissions e no pedido de NF", () => {
    render(<Page url="2026-08" />);
    expect(seen.emissions.at(-1)).toBe("2026-08");
    fireEvent.click(screen.getByText("Emitir NF"));
    expect(seen.nf.at(-1)).toBe("2026-08");
  });

  it("competência trocada na pastinha chega igual nos dois", () => {
    render(<Page url="2026-08" />);
    fireEvent.click(screen.getAllByRole("button", { name: /próxim/i })[0]!);
    expect(seen.emissions.at(-1)).toBe("2026-09");
    fireEvent.click(screen.getByText("Emitir NF"));
    expect(seen.nf.at(-1)).toBe("2026-09");
  });
});

describe("boleto sem produção liberada", () => {
  it("não aparece selo de boleto e não entra no contador", () => {
    const badges = buildCompetenceBadges(
      [{ id: "c1", brand: "morar", status: "ativo" }],
      { emissions: [{ contract_id: "c1", tipo: "recibo", status: "emitido" }], boletos: [{ contract_id: "c1", ambiente: "sandbox", estado: "pendente" }], nfse: [] },
      { morar: { boletoAtivo: false, nfModoTeste: true } },
      true,
    );
    expect(badges["c1"]?.some((b) => b.kind === "boleto")).toBe(false);
    expect(countPending(badges)).toBe(0);
  });
});
