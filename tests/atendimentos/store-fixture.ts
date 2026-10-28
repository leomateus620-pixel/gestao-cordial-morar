import { create } from "zustand";

type Agency = "todas" | "cordial" | "morar";
type FixtureState = {
  agency: Agency;
  setAgency: (agency: Agency) => void;
  imoveis: [];
  corretores: [];
  clientes: [];
};

// Never writes synthetic contact data to the application's persisted store.
export const useApp = create<FixtureState>((set) => ({
  agency: "todas",
  setAgency: (agency) => set({ agency }),
  imoveis: [],
  corretores: [],
  clientes: [],
}));
