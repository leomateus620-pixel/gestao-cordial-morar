import { FilePlus2, ReceiptText } from "lucide-react";

export function EmptySalesState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="glass-panel-strong overflow-hidden rounded-3xl p-6 text-center sm:p-8">
      <div className="mx-auto grid size-14 place-items-center rounded-3xl bg-primary/10 text-primary ring-1 ring-primary/10">
        <ReceiptText className="size-7" />
      </div>
      <h2 className="mt-4 text-xl font-black tracking-tight text-foreground">
        Nenhuma venda registrada
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm font-medium leading-6 text-foreground/58">
        Cadastre a primeira venda, anexe o contrato e mantenha o histórico comercial organizado.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98]"
      >
        <FilePlus2 className="size-4" />
        Cadastrar primeira venda
      </button>
    </section>
  );
}
