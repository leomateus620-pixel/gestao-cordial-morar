import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { isPushConfigured } from "@/lib/push/firebase-config";
import { disablePush, enablePush, type PushStatus } from "@/lib/push/push-client";

const MESSAGES: Partial<Record<PushStatus, string>> = {
  denied: "Permissão bloqueada no navegador.",
  "open-in-new-tab": "Abra o app em uma aba própria para ativar.",
  unsupported: "Este navegador não suporta push.",
  "not-configured": "Push ainda não configurado.",
};

export function PushToggle() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setEnabled(Notification.permission === "granted");
  }, []);

  const configured = isPushConfigured();

  async function handleChange(next: boolean) {
    setBusy(true);
    setHint(null);
    if (next) {
      const result = await enablePush();
      setEnabled(result.status === "registered");
      setHint(result.status === "registered" ? null : (MESSAGES[result.status] ?? result.message ?? null));
    } else {
      await disablePush();
      setEnabled(false);
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      <Smartphone className="size-4" />
      <div className="min-w-0 flex-1 text-left">
        <p className="text-xs font-semibold">Push no celular</p>
        <p className="text-[10px] leading-relaxed text-foreground/55">
          {hint ?? (configured ? "Avisos mesmo com o app fechado." : "Push ainda não configurado.")}
        </p>
      </div>
      <Switch
        checked={enabled}
        disabled={busy || !configured}
        onCheckedChange={(value) => void handleChange(value)}
        aria-label="Ativar notificações push"
      />
    </div>
  );
}
