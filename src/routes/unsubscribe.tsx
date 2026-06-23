import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
  head: () => ({ meta: [{ title: "Descadastrar — Gestão Cordial & Morar" }] }),
});

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid" }
  | { kind: "success" }
  | { kind: "error"; message: string };

function UnsubscribePage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const token = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("token")
    : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setState({ kind: "invalid" });
        return;
      }
      try {
        const res = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`);
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "invalid" });
          return;
        }
        if (json?.valid === false && json?.reason === "already_unsubscribed") {
          setState({ kind: "already" });
        } else if (json?.valid === true) {
          setState({ kind: "valid" });
        } else {
          setState({ kind: "invalid" });
        }
      } catch (err) {
        if (!cancelled)
          setState({ kind: "error", message: err instanceof Error ? err.message : "Erro de rede." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function confirm() {
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", message: json?.error ?? "Falha ao processar." });
      } else if (json?.success) {
        setState({ kind: "success" });
      } else if (json?.reason === "already_unsubscribed") {
        setState({ kind: "already" });
      } else {
        setState({ kind: "error", message: "Não foi possível concluir." });
      }
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Erro de rede." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Gestão Cordial &amp; Morar</h1>
        <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          Descadastro de e-mails
        </p>

        {state.kind === "loading" && (
          <p className="mt-6 text-sm text-muted-foreground">Validando seu link…</p>
        )}

        {state.kind === "valid" && (
          <>
            <p className="mt-6 text-sm text-foreground">
              Você está prestes a parar de receber e-mails automáticos da Gestão Cordial &amp; Morar.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={confirm}
              className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Processando…" : "Confirmar descadastro"}
            </button>
          </>
        )}

        {state.kind === "already" && (
          <p className="mt-6 text-sm text-foreground">
            Este endereço já estava descadastrado. Nenhuma ação adicional é necessária.
          </p>
        )}

        {state.kind === "success" && (
          <p className="mt-6 text-sm text-foreground">
            Pronto. Você não receberá mais e-mails automáticos da Gestão Cordial &amp; Morar.
          </p>
        )}

        {state.kind === "invalid" && (
          <p className="mt-6 text-sm text-destructive">
            Link inválido ou expirado. Se quiser sair da lista, responda diretamente ao último e-mail recebido.
          </p>
        )}

        {state.kind === "error" && (
          <p className="mt-6 text-sm text-destructive">{state.message}</p>
        )}
      </div>
    </div>
  );
}
