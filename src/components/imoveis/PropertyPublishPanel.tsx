import { useState } from "react";
import { toast } from "sonner";
import { CloudUpload, ExternalLink, Loader2, PowerOff } from "lucide-react";
import {
  useEnqueuePropertySync,
  useOwnedPublicationStatus,
  usePropertySyncStatus,
} from "@/hooks/usePropertySync";
import type { OwnedPublicationView } from "@/lib/imoveis/publish.functions";

const BRANDS = [
  { key: "cordial", label: "Cordial", host: "cordialimoveis.com" },
  { key: "morar", label: "Morar", host: "imobiliariamorarimoveis.com.br" },
] as const;

const fmt = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : null);

function ownedState(row: OwnedPublicationView | undefined) {
  if (!row || row.state === "none") return { text: "Não publicado", tone: "text-foreground/65 bg-foreground/8" };
  if (row.state === "published") return { text: "No ar", tone: "text-emerald-700 bg-emerald-500/12" };
  if (row.state === "draft" || row.decision === "publish")
    return { text: "Decisão salva — aguardando", tone: "text-amber-700 bg-amber-500/12" };
  return { text: "Retirado", tone: "text-foreground/65 bg-foreground/8" };
}

/**
 * Publicação nos sites próprios. A ImobiBrasil está desligada: o estado antigo
 * dela aparece só como histórico, sem botões que acionem a integração.
 */
export function PropertyPublishPanel({
  propertyId,
  canPublish,
}: {
  propertyId: string;
  canPublish: boolean;
  isAdmin: boolean;
}) {
  const owned = useOwnedPublicationStatus(propertyId);
  const legacy = usePropertySyncStatus(propertyId);
  const enqueue = useEnqueuePropertySync(propertyId);
  const [selected, setSelected] = useState<string[]>([]);
  const byBrand = new Map((owned.data ?? []).map((row) => [row.brand, row]));

  async function run(action: "publish" | "unpublish", brands: string[]) {
    if (!brands.length) {
      toast.error("Selecione ao menos um site.");
      return;
    }
    // Revisão que o usuário está vendo; se outra pessoa salvou, o servidor recusa.
    const expectedRevision = owned.data?.[0]?.propertyRevision ?? null;
    try {
      const result = (await enqueue.mutateAsync({ propertyId, providers: brands, action, expectedRevision })) as {
        owned?: Array<{ brand: string; ok: boolean; error?: string; conflict?: boolean; pendingReview?: boolean; blockReason?: string | null; state?: string }>;
      };
      const rows = result.owned ?? [];
      const label = (b: string) => (b === "cordial" ? "Cordial" : "Morar");
      const failed = rows.filter((r) => !r.ok);
      const pending = rows.filter((r) => r.ok && action === "publish" && r.state !== "published");
      if (failed.some((r) => r.conflict)) {
        toast.error("O cadastro foi alterado por outra pessoa. Atualize a página antes de publicar.");
      } else if (failed.length) {
        toast.warning(`Não foi possível em: ${failed.map((r) => `${label(r.brand)} (${r.error ?? "erro"})`).join(", ")}. Os demais foram salvos.`);
        setSelected(failed.map((r) => r.brand));
        return;
      } else if (pending.length) {
        toast.info(`Decisão salva, ainda não está no ar: ${pending.map((r) => `${label(r.brand)} — ${r.blockReason ?? "aguardando conferência"}`).join("; ")}.`);
      } else toast.success(action === "publish" ? "No ar nos sites selecionados." : "Retirado do site.");
      setSelected([]);
    } catch (error) {
      toast.error((error as Error)?.message ?? "Não foi possível salvar a decisão.");
    }
  }

  const legacyRows = (legacy.data ?? []).filter((row) => row.externalPropertyId || row.status !== "draft");

  return (
    <section className="glass-panel rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <CloudUpload className="size-4 text-primary" /> Publicação nos sites
        </h2>
        {owned.isFetching && <Loader2 className="size-3.5 animate-spin text-foreground/35" />}
      </div>

      {owned.isError && (
        <p className="mt-3 rounded-2xl bg-amber-500/12 p-3 text-[11px] font-semibold text-amber-800">
          Não foi possível confirmar a situação nos sites agora.{" "}
          <button type="button" className="underline" onClick={() => void owned.refetch()}>Tentar de novo</button>
        </p>
      )}
      <div className="mt-3 space-y-2">
        {BRANDS.map((brand) => {
          const row = byBrand.get(brand.key);
          const state = owned.isError ? { text: "Não confirmado", tone: "text-amber-700 bg-amber-500/12" } : ownedState(row);
          return (
            <div key={brand.key} className="rounded-2xl bg-white/50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {canPublish && (
                  <input
                    type="checkbox"
                    checked={selected.includes(brand.key)}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(brand.key) ? current.filter((i) => i !== brand.key) : [...current, brand.key],
                      )
                    }
                    className="size-4 accent-[hsl(var(--primary))]"
                    aria-label={`Selecionar ${brand.label}`}
                  />
                )}
                <span className="text-sm font-semibold">{brand.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${state.tone}`}>{state.text}</span>
                {row?.publicReference && (
                  <span className="font-mono text-[10px] text-foreground/45">{row.publicReference}</span>
                )}
                {row?.url && (
                  <a href={row.url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                    Ver no {brand.host} <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              {row?.updatedAt && (
                <p className="mt-1 text-[11px] text-foreground/55">Última mudança: {fmt(row.updatedAt)}</p>
              )}
              {canPublish && row?.state === "published" && (
                <button type="button" disabled={enqueue.isPending} onClick={() => void run("unpublish", [brand.key])}
                  className="mt-2 rounded-full bg-foreground/8 px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50">
                  Retirar do site
                </button>
              )}
            </div>
          );
        })}
      </div>

      {canPublish && (
        <button type="button" onClick={() => void run("publish", selected)}
          disabled={enqueue.isPending || selected.length === 0}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 disabled:opacity-40">
          {enqueue.isPending ? "Salvando decisão…" : "Publicar nos selecionados"}
        </button>
      )}

      <details className="mt-3 rounded-2xl bg-foreground/5 p-3 text-[11px] text-foreground/65">
        <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
          <PowerOff className="size-3" /> ImobiBrasil: OFF (histórico)
        </summary>
        <div className="mt-2 space-y-1">
          <p>A integração está desligada. Nada é enviado nem consultado; o registro abaixo é só o último estado conhecido.</p>
          {legacyRows.length === 0 && <p>Sem histórico neste imóvel.</p>}
          {legacyRows.map((row) => (
            <p key={row.provider}>
              {row.provider === "cordial" ? "Cordial" : "Morar"}: {row.status}
              {row.externalPropertyId ? ` · anúncio #${row.externalPropertyId}` : ""}
              {row.lastVerifiedAt ? ` · última confirmação ${fmt(row.lastVerifiedAt)}` : ""}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
