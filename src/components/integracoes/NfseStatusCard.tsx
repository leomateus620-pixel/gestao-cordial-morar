import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  getNfseSettings,
  saveNfseSettings,
  type NfseSettings,
} from "@/lib/nfse/nfse.functions";

const BRANDS = ["cordial", "morar"] as const;

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
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
    </label>
  );
}

function BrandCard({ settings }: { settings: NfseSettings }) {
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
          aliquotaIss: Number(form.aliquotaIss.replace(",", ".")) || 0,
          modoTeste: form.modoTeste,
          simplesNacional: form.simplesNacional,
        },
      }),
    onSuccess: () => {
      toast.success("Configuração fiscal salva.");
      void qc.invalidateQueries({ queryKey: ["nfse-settings-status"] });
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

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="CNPJ do prestador"
          value={form.cnpj}
          onChange={(v) => setForm((f) => ({ ...f, cnpj: v }))}
          placeholder="00000000000000"
        />
        <Field
          label="Inscrição municipal"
          value={form.inscricaoMunicipal}
          onChange={(v) => setForm((f) => ({ ...f, inscricaoMunicipal: v }))}
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
          placeholder="10.05"
        />
        <Field
          label="Código NBS"
          value={form.codigoNbs}
          onChange={(v) => setForm((f) => ({ ...f, codigoNbs: v }))}
        />
        <Field
          label="Alíquota ISS (%)"
          value={form.aliquotaIss}
          onChange={(v) => setForm((f) => ({ ...f, aliquotaIss: v }))}
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
          disabled={mutation.isPending}
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
      </div>
      {query.isLoading ? (
        <p className="text-xs text-foreground/55">Verificando configuração…</p>
      ) : query.isError ? (
        <p className="text-xs text-foreground/55">Configuração indisponível para o seu perfil.</p>
      ) : (
        <div className="space-y-3">
          {(query.data ?? []).map((s) => (
            <BrandCard key={s.brand} settings={s} />
          ))}
        </div>
      )}
    </section>
  );
}
