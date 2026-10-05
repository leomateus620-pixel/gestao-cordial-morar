import type { ReactNode } from "react";

export function RentalNfseHistoryState({
  loading,
  failed,
  count,
  tests,
  onRetry,
  children,
}: {
  loading: boolean;
  failed: boolean;
  count: number;
  tests: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  if (loading)
    return (
      <p role="status" className="py-3 text-sm text-foreground/70">
        Carregando histórico fiscal…
      </p>
    );
  if (failed)
    return (
      <div role="alert" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
        <p>Não foi possível carregar o histórico. A ausência de registros não foi confirmada.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-900/25 px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Tentar novamente
        </button>
      </div>
    );
  if (!count)
    return (
      <p className="py-3 text-sm text-foreground/70">
        {tests
          ? "Nenhuma validação de teste registrada."
          : "Nenhuma operação real registrada para este contrato."}
      </p>
    );
  return children;
}
