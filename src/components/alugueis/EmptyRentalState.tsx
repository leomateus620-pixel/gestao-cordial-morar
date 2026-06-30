import { KeyRound, Plus } from "lucide-react";

export function EmptyRentalState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="glass-panel flex flex-col items-center gap-3 rounded-3xl p-8 text-center">
      <div className="rounded-full bg-primary/10 p-3">
        <KeyRound className="size-6 text-primary" />
      </div>
      <h3 className="text-sm font-semibold">Nenhum aluguel cadastrado</h3>
      <p className="max-w-xs text-xs text-foreground/60">
        Comece registrando seu primeiro contrato para acompanhar imóveis, locatários e
        pagamentos em um único lugar.
      </p>
      <button
        onClick={onCreate}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.99]"
      >
        <Plus className="size-3.5" /> Cadastrar primeiro aluguel
      </button>
    </div>
  );
}
