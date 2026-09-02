import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isPushConfigured } from "@/lib/push/firebase-config";
import { enablePush, type PushStatus } from "@/lib/push/push-client";

const SNOOZE_KEY = "gc.push.prompt-snooze";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function snoozeKey(userId: string) {
  return `${SNOOZE_KEY}:${userId}`;
}

function isSnoozed(userId: string) {
  try {
    const value = Number(window.localStorage.getItem(snoozeKey(userId)) ?? "0");
    return Number.isFinite(value) && Date.now() < value;
  } catch {
    return false;
  }
}

function snooze(userId: string) {
  try {
    window.localStorage.setItem(snoozeKey(userId), String(Date.now() + SNOOZE_MS));
  } catch {
    // Um storage bloqueado nunca pode quebrar o aviso.
  }
}

const FAILURE_HINT: Partial<Record<PushStatus, string>> = {
  denied: "Permissão negada. Reative nas configurações do site no navegador.",
  "open-in-new-tab": "Abra o sistema em uma aba própria para ativar as notificações.",
  unsupported: "Este navegador não suporta notificações push.",
  "not-configured": "Push ainda não configurado.",
};

export function PushPermissionPrompt({ userId }: { userId: string | null }) {
  const [visible, setVisible] = useState(false);
  const [inIframe, setInIframe] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId) {
      setVisible(false);
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (!isPushConfigured()) return;
    if (Notification.permission !== "default") return;
    if (isSnoozed(userId)) return;
    setInIframe(window.top !== window.self);
    setVisible(true);
  }, [userId]);

  if (!visible) return null;

  async function handleEnable() {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result.status === "registered") {
      toast.success("Notificações ativadas neste dispositivo.");
      setVisible(false);
      return;
    }
    const hint = FAILURE_HINT[result.status] ?? result.message ?? "Não foi possível ativar.";
    toast.error(hint);
    if (result.status !== "open-in-new-tab") {
      if (userId) snooze(userId);
      setVisible(false);
    }
  }

  function handleDismiss() {
    if (userId) snooze(userId);
    setVisible(false);
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-card p-4 shadow-lg">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Ative as notificações</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {inIframe
              ? "Abra o sistema em uma aba própria para permitir os avisos no celular ou PC."
              : "Receba avisos de fotos, atendimentos e agenda no celular ou PC."}
          </p>
          <div className="mt-3 flex gap-2">
            {inIframe ? (
              <Button
                size="sm"
                onClick={() => window.open(window.location.href, "_blank", "noopener")}
              >
                Abrir em nova aba
              </Button>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => void handleEnable()}>
                {busy ? "Ativando..." : "Ativar"}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={handleDismiss}>
              Agora não
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Fechar aviso de notificações"
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={handleDismiss}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
