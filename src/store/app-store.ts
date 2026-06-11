import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  agendaSeed,
  atendimentosSeed,
  clientesSeed,
  contratosSeed,
  corretoresSeed,
  imoveisSeed,
  lancamentosSeed,
  type AgencyId,
  type Atendimento,
  type Cliente,
  type Compromisso,
  type Contrato,
  type Corretor,
  type Imovel,
  type Lancamento,
} from "@/lib/mock/data";

type AgencyFilter = AgencyId | "todas";

type State = {
  agency: AgencyFilter;
  clientes: Cliente[];
  imoveis: Imovel[];
  corretores: Corretor[];
  atendimentos: Atendimento[];
  contratos: Contrato[];
  agenda: Compromisso[];
  lancamentos: Lancamento[];
  setAgency: (a: AgencyFilter) => void;
  addCliente: (c: Omit<Cliente, "id" | "iniciais" | "criadoEm">) => void;
  addImovel: (i: Omit<Imovel, "id">) => void;
  addAtendimento: (a: Omit<Atendimento, "id" | "criadoEm">) => void;
  addCompromisso: (c: Omit<Compromisso, "id">) => void;
};

function iniciais(nome: string) {
  const parts = nome.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
}

const id = () => Math.random().toString(36).slice(2, 10);

export const useApp = create<State>()(
  persist(
    (set) => ({
      agency: "todas",
      clientes: clientesSeed,
      imoveis: imoveisSeed,
      corretores: corretoresSeed,
      atendimentos: atendimentosSeed,
      contratos: contratosSeed,
      agenda: agendaSeed,
      lancamentos: lancamentosSeed,
      setAgency: (agency) => set({ agency }),
      addCliente: (c) =>
        set((s) => ({
          clientes: [
            { ...c, id: id(), iniciais: iniciais(c.nome), criadoEm: new Date().toISOString() },
            ...s.clientes,
          ],
        })),
      addImovel: (i) => set((s) => ({ imoveis: [{ ...i, id: id() }, ...s.imoveis] })),
      addAtendimento: (a) =>
        set((s) => ({
          atendimentos: [{ ...a, id: id(), criadoEm: new Date().toISOString() }, ...s.atendimentos],
        })),
      addCompromisso: (c) => set((s) => ({ agenda: [{ ...c, id: id() }, ...s.agenda] })),
    }),
    { name: "gc.store.v1" },
  ),
);

export function useFiltered<T extends { imobiliaria: AgencyId }>(items: T[]): T[] {
  const agency = useApp((s) => s.agency);
  return agency === "todas" ? items : items.filter((i) => i.imobiliaria === agency);
}