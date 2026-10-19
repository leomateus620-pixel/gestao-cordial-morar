import { useEffect } from "react";

export function SystemUnavailable({
  onRetry,
  autoRetryMs = 15000,
  fullScreen = true,
}: {
  onRetry: () => void;
  autoRetryMs?: number;
  fullScreen?: boolean;
}) {
  useEffect(() => {
    if (!autoRetryMs) return;
    const t = setInterval(onRetry, autoRetryMs);
    return () => clearInterval(t);
  }, [onRetry, autoRetryMs]);

  return (
    <div
      role="alert"
      className={`flex items-center justify-center bg-background px-4 ${fullScreen ? "min-h-screen" : "py-24"}`}
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Sistema temporariamente indisponível
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tentando reconectar… Seus dados estão seguros. Se demorar, tente de novo em instantes.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Tentar de novo
        </button>
      </div>
    </div>
  );
}
