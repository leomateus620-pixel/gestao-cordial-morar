import { create } from "zustand";

/** Intenção transitória de interface: abre o cadastro existente, sem alterar a URL. */
export const useRentalFormRequest = create<{
  requested: boolean;
  request: () => void;
  consume: () => void;
}>((set) => ({
  requested: false,
  request: () => set({ requested: true }),
  consume: () => set({ requested: false }),
}));
