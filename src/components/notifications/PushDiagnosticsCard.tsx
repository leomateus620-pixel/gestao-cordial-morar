import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, RefreshCcw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { isPushConfigured } from "@/lib/push/firebase-config";
import { enablePush, type PushStatus } from "@/lib/push/push-client";
import { getPushDiagnostics, sendTestPush } from "@/lib/push/push-diagnostics.functions";

const FAILURE_HINT: Partial<Record<PushStatus, string>> = {
  denied: "Permissão negada. Reative nas configurações do site no navegador.",
  "open-in-new-tab": "Abra o sistema em uma aba própria (fora do preview) para ativar.",
  unsupported:
    "Este navegador não suporta push. No iPhone, adicione o site à Tela de Início e abra por lá.",
  "not-configured": "Push ainda não configurado no projeto.",
};

function permissionLabel(value: NotificationPermission | "indisponivel") {
  if (value === "granted") return "Concedida";
  if (value === "denied") return "Bloqueada";
  if (value === "default") return "Ainda não pedida";
  return "Indisponível neste navegador";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}

export function PushDiagnosticsCard() {
  const queryClient = useQueryClient();
  const fetchDiagnostics = useServerFn(getPushDiagnostics);
  const runTest = useServerFn(sendTestPush);

  const [permission, setPermission] = useState<NotificationPermission | "indisponivel">(
    "indisponivel",
  );
  const [hasServiceWorker, setHasServiceWorker] = useState(false);
  const [inIframe, setInIframe] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPermission("Notification" in window ? Notification.permission : "indisponivel");
    setInIframe(window.top !== window.self);
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        setHasServiceWorker(
          registrations.some((registration) =>
            (registration.active?.scriptURL ?? "").includes("firebase-messaging-sw.js"),
          ),
        );
      });
    }
  }, []);

  const diagnostics = useQuery({
    queryKey: ["push", "diagnostics"],
    queryFn: () => fetchDiagnostics({}),
  });

  const testMutation = useMutation({
    mutationFn: () => runTest({ data: { preset: "dupla" as const } }),
    onSuccess: () => toast.success("2 notificações de teste enviadas."),
    onError: (error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Falha ao enviar teste."),
  });

  const devices = diagnostics.data?.devices ?? [];
  const configured = isPushConfigured();

  async function handleEnable() {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
    if (result.status === "registered") {
      toast.success("Dispositivo registrado para notificações.");
      await queryClient.invalidateQueries({ queryKey: ["push", "diagnostics"] });
      setHasServiceWorker(true);
      return;
    }
    toast.error(FAILURE_HINT[result.status] ?? result.message ?? "Não foi possível ativar.");
  }

  return (
    <article className="glass-panel rounded-3xl p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <BellRing className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Notificações push</p>
          <p className="text-[11px] text-foreground/55">
            Diagnóstico deste dispositivo e teste de envio.
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Atualizar diagnóstico"
          onClick={() => void diagnostics.refetch()}
        >
          <RefreshCcw className="size-4" />
        </Button>
      </div>

      <div className="mt-3">
        <Row label="Push configurado" value={configured ? "Sim" : "Não"} />
        <Row label="Permissão do navegador" value={permissionLabel(permission)} />
        <Row label="Service worker ativo" value={hasServiceWorker ? "Sim" : "Não"} />
        <Row
          label="Dispositivos registrados"
          value={diagnostics.isPending ? "..." : String(devices.length)}
        />
      </div>

      {inIframe ? (
        <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
          Você está no preview embutido. Abra o sistema em uma aba própria para registrar o
          dispositivo. No iPhone, adicione o site à Tela de Início e abra por lá antes de ativar.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !configured} onClick={() => void handleEnable()}>
          <Smartphone className="mr-1.5 size-4" />
          {busy ? "Ativando..." : "Ativar neste dispositivo"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={testMutation.isPending}
          onClick={() => testMutation.mutate()}
        >
          {testMutation.isPending ? "Enviando..." : "Enviar 2 testes para mim"}
        </Button>
      </div>

      {devices.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {devices.map((device) => (
            <li key={device.id} className="truncate text-[11px] text-foreground/55">
              {device.userAgent ?? "Dispositivo"}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
