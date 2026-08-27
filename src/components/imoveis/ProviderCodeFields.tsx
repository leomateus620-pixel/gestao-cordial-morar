import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { PropertyCarteira } from "@/types/property";
import { PROVIDER_LABEL } from "./PublishTargetSelector";

export type ProviderCodeStatus = "generating" | "reserved" | "conflict" | "error";

export type ProviderCodeState = {
  code: string;
  reservationId: string | null;
  status: ProviderCodeStatus;
  message?: string | null;
};

export type ProviderCodes = Partial<Record<PropertyCarteira, ProviderCodeState>>;

const STATUS_LABEL: Record<ProviderCodeStatus, string> = {
  generating: "Gerando",
  reserved: "Reservado",
  conflict: "Em uso",
  error: "Erro",
};

const inputCls =
  "w-full rounded-2xl border px-3 py-2 text-sm outline-none transition focus:border-primary/50";

export function ProviderCodeFields({
  providers,
  codes,
  onManualChange,
  onGenerate,
}: {
  providers: PropertyCarteira[];
  codes: ProviderCodes;
  onManualChange: (provider: PropertyCarteira, code: string) => void;
  onGenerate: (provider: PropertyCarteira) => void;
}) {
  const list = (["cordial", "morar"] as PropertyCarteira[]).filter((p) => providers.includes(p));
  if (!list.length) {
    return (
      <p className="rounded-2xl bg-foreground/[0.04] px-3 py-2 text-[11px] text-foreground/55">
        Selecione ao menos um destino para gerar o código da imobiliária.
      </p>
    );
  }

  const both = list.length === 2;
  const generatingAll = list.every((p) => codes[p]?.status === "generating");

  return (
    <div className="space-y-2">
      <div className={"grid gap-3 " + (both ? "sm:grid-cols-2" : "")}>
        {list.map((provider) => {
          const state = codes[provider];
          const status = state?.status ?? null;
          const generating = status === "generating";
          return (
            <div
              key={provider}
              className={
                "rounded-2xl border p-3 " +
                (provider === "cordial" ? "brand-field-cordial" : "brand-field-morar")
              }
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/60">
                  Código {provider === "cordial" ? "Cordial" : "Morar"}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-foreground/50">
                  {status ? STATUS_LABEL[status] : "Disponível"}
                </span>
              </div>
              <input
                value={state?.code ?? ""}
                onChange={(e) => onManualChange(provider, e.target.value)}
                placeholder={`Código do site ${PROVIDER_LABEL[provider]}`}
                className={inputCls + " border-white/60 bg-white/70 focus:bg-white"}
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-[10px] text-foreground/50">
                  {state?.message ?? "Número exclusivo desta imobiliária."}
                </span>
                <button
                  type="button"
                  onClick={() => onGenerate(provider)}
                  disabled={generating}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-foreground/[0.06] px-2.5 py-1.5 text-[10px] font-bold text-foreground/70 transition hover:bg-foreground/10 disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3" />
                  )}
                  {state?.code ? "Gerar outro" : "Gerar"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {both ? (
        <button
          type="button"
          onClick={() => list.forEach((p) => onGenerate(p))}
          disabled={generatingAll}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-primary px-3.5 py-2 text-[11px] font-bold text-primary-foreground transition disabled:opacity-50"
        >
          {generatingAll ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          Gerar códigos
        </button>
      ) : null}
    </div>
  );
}
