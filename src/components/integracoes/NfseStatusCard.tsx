import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  getNfseHealth,
  getNfseSettings,
  getNfseViewer,
  reclassifyStuckNfse,
  saveNfseSettings,
  type NfseBrandHealth,
  type NfseSettings,
} from "@/lib/nfse/nfse.functions";
import { validateNfseSettings } from "@/lib/nfse/validation";

const HEALTH_LABEL: Record<string, string> = {
  teste_ok: "Validada (teste)",
  emitida: "Emitida",
  erro: "Não emitida",
  cancelada: "Cancelada",
  processando: "Enviando…",
  incerto: "Aguardando conferência",
  nao_emitida: "Não emitida (conferida)",
};

function fmtSP(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function HealthLine({ health }: { health?: NfseBrandHealth }) {
  if (!health) return null;
  return (
    <div className="mb-3 space-y-0.5 rounded-xl bg-foreground/[0.04] px-3 py-2 text-[11px] text-foreground/70">
      <p>
        <span className="font-bold">Última tentativa:</span>{" "}
        {health.ultima
          ? `${HEALTH_LABEL[health.ultima.status] ?? health.ultima.status}${health.ultima.modoTeste ? " (teste)" : ""} · ${fmtSP(health.ultima.createdAt)}`
          : "nenhuma"}
      </p>
      {health.ultima?.mensagem && <p className="text-amber-900">{health.ultima.mensagem}</p>}
      <p>
        <span className="font-bold">Última nota real:</span>{" "}
        {health.ultimoSucessoReal ? fmtSP(health.ultimoSucessoReal) : "nenhuma"} ·{" "}
        <span className="font-bold">30 dias:</span> {health.incerto30d} aguardando conferência,{" "}
        {health.erro30d} recusadas, {health.naoEmitida30d} não emitidas (conferidas)
      </p>
    </div>
  );
}

const BRANDS = ["cordial", "morar"] as const;

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.08em] text-foreground/55">
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-foreground/[0.1] bg-white/80 px-3 py-2 text-xs outline-none focus:border-primary/40"
      />
      {error && <span className="mt-1 block text-[10px] font-semibold text-destructive">{error}</span>}
    </label>
  );
}

function BrandCard({ settings, health }: { settings: NfseSettings; health?: NfseBrandHealth }) {
  const qc = useQueryClient();
  const save = useServerFn(saveNfseSettings);
  const [form, setForm] = useState({
    cnpj: settings.cnpj,
    inscricaoMunicipal: settings.inscricaoMunicipal ?? "",
    razaoSocial: settings.razaoSocial ?? "",
    codigoItemListaServico: settings.codigoItemListaServico,
    codigoNbs: settings.codigoNbs ?? "",
    aliquotaIss: String(settings.aliquotaIss),
    modoTeste: settings.modoTeste,
    simplesNacional: settings.simplesNacional,
  });

  useEffect(() => {
    setForm({
      cnpj: settings.cnpj,
      inscricaoMunicipal: settings.inscricaoMunicipal ?? "",
      razaoSocial: settings.razaoSocial ?? "",
      codigoItemListaServico: settings.codigoItemListaServico,
      codigoNbs: settings.codigoNbs ?? "",
      aliquotaIss: String(settings.aliquotaIss),
      modoTeste: settings.modoTeste,
      simplesNacional: settings.simplesNacional,
    });
  }, [settings]);

  const errors = validateNfseSettings({
    cnpj: form.cnpj,
    inscricaoMunicipal: form.inscricaoMunicipal,
    codigoItemListaServico: form.codigoItemListaServico,
    codigoNbs: form.codigoNbs,
    aliquotaIss: Number(form.aliquotaIss.replace(",", ".")),
  });
  const hasErrors = Object.keys(errors).length > 0;

  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          brand: settings.brand,
          cnpj: form.cnpj,
          inscricaoMunicipal: form.inscricaoMunicipal,
          razaoSocial: form.razaoSocial,
          codigoItemListaServico: form.codigoItemListaServico,
          codigoNbs: form.codigoNbs,
          aliquotaIss: Number(form.aliquotaIss.replace(",", ".")),
          modoTeste: form.modoTeste,
          simplesNacional: form.simplesNacional,
        },
      }),
    onSuccess: () => {
      toast.success("Configuração fiscal salva.");
      void qc.invalidateQueries({ queryKey: ["nfse-settings-status"] });
      void qc.invalidateQueries({ queryKey: ["rental-nfse-preview"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar."),
  });

  const ready = Boolean(settings.cnpj) && settings.senhaConfigurada;

  return (
    <div className="rounded-2xl border border-foreground/[0.07] bg-white/70 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold capitalize text-foreground">{settings.brand}</p>
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold " +
            (ready ? "bg-emerald-500/10 text-emerald-800" : "bg-amber-500/12 text-amber-900")
          }
        >
          {ready ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
          {settings.senhaConfigurada ? (ready ? "Pronta" : "Faltam dados") : "Senha faltando"}
        </span>
      </div>

      <HealthLine health={health} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="CNPJ do prestador"
          value={form.cnpj}
          onChange={(v) => setForm((f) => ({ ...f, cnpj: v }))}
          error={errors["cnpj"]}
          placeholder="00000000000000"
        />
        <Field
          label="Inscrição municipal"
          value={form.inscricaoMunicipal}
          onChange={(v) => setForm((f) => ({ ...f, inscricaoMunicipal: v }))}
          error={errors["inscricaoMunicipal"]}
        />
        <Field
          label="Razão social"
          value={form.razaoSocial}
          onChange={(v) => setForm((f) => ({ ...f, razaoSocial: v }))}
        />
        <Field
          label="Item da lista de serviço"
          value={form.codigoItemListaServico}
          onChange={(v) => setForm((f) => ({ ...f, codigoItemListaServico: v }))}
          error={errors["codigoItemListaServico"]}
          placeholder="10.05"
        />
        <Field
          label="Código NBS"
          value={form.codigoNbs}
          onChange={(v) => setForm((f) => ({ ...f, codigoNbs: v }))}
          error={errors["codigoNbs"]}
        />
        <Field
          label="Alíquota ISS (%)"
          value={form.aliquotaIss}
          onChange={(v) => setForm((f) => ({ ...f, aliquotaIss: v }))}
          error={errors["aliquotaIss"]}
          placeholder="3,0000"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[11px] font-semibold text-foreground/70">
          <Switch
            checked={form.modoTeste}
            onCheckedChange={(v) => setForm((f) => ({ ...f, modoTeste: v }))}
          />
          Modo teste
        </label>
        <label className="flex items-center gap-2 text-[11px] font-semibold text-foreground/70">
          <Switch
            checked={form.simplesNacional}
            onCheckedChange={(v) => setForm((f) => ({ ...f, simplesNacional: v }))}
          />
          Simples Nacional
        </label>
        <button
          type="button"
          disabled={mutation.isPending || hasErrors}
          onClick={() => mutation.mutate()}
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          {mutation.isPending && <Loader2 className="size-3.5 animate-spin" />}
          Salvar
        </button>
      </div>

      {!settings.senhaConfigurada && (
        <p className="mt-2 text-[11px] text-amber-900">
          Falta a senha do webservice. Cadastre em Configurações do projeto → Secrets como{" "}
          <code>IPM_NFSE_SENHA_{settings.brand.toUpperCase()}</code>.
        </p>
      )}
    </div>
  );
}

export function NfseStatusCard({ enabled }: { enabled: boolean }) {
  const fetchSettings = useServerFn(getNfseSettings);
  const fetchHealth = useServerFn(getNfseHealth);
  const health = useQuery({ queryKey: ["nfse-health"], enabled, queryFn: () => fetchHealth() });
  const viewerFn = useServerFn(getNfseViewer);
  const viewer = useQuery({ queryKey: ["nfse-viewer"], enabled, queryFn: () => viewerFn(), staleTime: 300_000 });
  const reclassifyFn = useServerFn(reclassifyStuckNfse);
  const qcRoot = useQueryClient();
  const reclassify = useMutation({
    mutationFn: () => reclassifyFn(),
    onSuccess: (r) => {
      void qcRoot.invalidateQueries({ queryKey: ["nfse-health"] });
      void qcRoot.invalidateQueries({ queryKey: ["rental-nfse"] });
      toast.success(
        `Pendências analisadas: ${r.analisadas}. Reclassificadas: ${r.alteradas.length}. Sem retorno gravado (marcação manual): ${r.semRetorno}.`,
      );
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Não foi possível reclassificar."),
  });
  const query = useQuery({
    queryKey: ["nfse-settings-status"],
    enabled,
    queryFn: async () =>
      Promise.all(BRANDS.map((brand) => fetchSettings({ data: { brand } }))),
  });

  if (!enabled) return null;

  return (
    <section className="glass-panel mb-5 rounded-3xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Receipt className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold">NFS-e Santa Rosa (IPM)</p>
          <p className="text-[11px] text-foreground/55">
            Nota do serviço de administração dos aluguéis (valor da comissão).
          </p>
        </div>
        {viewer.data?.isAdmin && (
          <button
            type="button"
            disabled={reclassify.isPending}
            onClick={() => reclassify.mutate()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-foreground/10 px-3 py-1.5 text-[11px] font-bold disabled:opacity-50"
          >
            {reclassify.isPending && <Loader2 className="size-3 animate-spin" />}
            Reclassificar pendências
          </button>
        )}
      </div>
      {query.isLoading ? (
        <p className="text-xs text-foreground/55">Verificando configuração…</p>
      ) : query.isError ? (
        <p className="text-xs text-foreground/55">Configuração indisponível para o seu perfil.</p>
      ) : (
        <div className="space-y-3">
          {(query.data ?? []).map((s) => (
            <BrandCard key={s.brand} settings={s} health={health.data?.find((h) => h.brand === s.brand)} />
          ))}
        </div>
      )}
    </section>
  );
}
