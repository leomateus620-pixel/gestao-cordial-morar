import { ArrowUpRight, FilePlus2 } from "lucide-react";

export function SalesHeader({ onCreate }: { onCreate: () => void }) {
  return (
    <header className="relative overflow-hidden rounded-[1.75rem] border border-white/70 bg-white/[0.66] px-5 py-5 shadow-[0_20px_54px_-40px_rgba(23,27,33,0.42)] backdrop-blur-xl sm:px-6 sm:py-6">
      <div
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent"
        aria-hidden="true"
      />

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-primary/75">
            <span className="h-px w-7 bg-primary/55" aria-hidden="true" />
            Histórico comercial
          </p>
          <h1 className="mt-2 text-[clamp(1.85rem,4.8vw,2.45rem)] font-black leading-[1.05] tracking-[-0.035em] text-foreground">
            Vendas
          </h1>
        </div>

        <button
          type="button"
          onClick={onCreate}
          className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-extrabold text-primary-foreground shadow-[0_14px_30px_-14px_rgba(30,100,125,0.72)] transition-[transform,box-shadow,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:bg-primary/92 hover:shadow-[0_18px_36px_-14px_rgba(30,100,125,0.78)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0 active:scale-[0.985] motion-reduce:transform-none motion-reduce:transition-none sm:w-auto"
        >
          <FilePlus2 className="size-4.5" aria-hidden="true" />
          Cadastrar venda
          <ArrowUpRight
            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none"
            aria-hidden="true"
          />
        </button>
      </div>
    </header>
  );
}
