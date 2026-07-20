import { FilePlus2, ReceiptText } from "lucide-react";

export function EmptySalesState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/[0.68] p-7 text-center shadow-[0_18px_46px_-36px_rgba(23,27,33,0.42)] backdrop-blur-xl sm:p-9">
      <div className="mx-auto grid size-13 place-items-center rounded-2xl bg-primary/[0.09] text-primary ring-1 ring-primary/12">
        <ReceiptText className="size-6" aria-hidden="true" />
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
        className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-extrabold text-primary-foreground shadow-[0_12px_26px_-14px_rgba(30,100,125,0.72)] transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-primary/92 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 active:translate-y-0 active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none sm:w-auto"
      >
        <FilePlus2 className="size-4" aria-hidden="true" />
        Cadastrar primeira venda
      </button>
    </section>
  );
}
