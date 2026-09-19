import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Copy, ShieldCheck } from "lucide-react";
import { listRemoteDuplicateReferences } from "@/lib/imoveis/publish.functions";

const ESTADOS: Record<string, string> = {
  remote_duplicate_detected: "Duplicado no site",
  awaiting_create_reconcile: "Criação sem resposta confirmada",
};

/**
 * Painel SOMENTE LEITURA de duplicidade no site. Nada aqui publica, altera ou
 * exclui: a exclusão do anúncio repetido é feita por uma pessoa, no painel do
 * site, depois de conferir qual cópia tem as fotos certas.
 */
export function RemoteDuplicatesCard({ enabled }: { enabled: boolean }) {
  const load = useServerFn(listRemoteDuplicateReferences);
  const query = useQuery({
    queryKey: ["remote-duplicate-references"],
    queryFn: () => load({}),
    enabled,
    staleTime: 60_000,
  });

  if (!enabled) return null;

  const rows = query.data ?? [];

  return (
    <section className="mb-5 rounded-2xl border border-border/60 bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <Copy className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Anúncios repetidos nos sites</h2>
      </header>

      {query.isLoading && <p className="text-[11px] text-foreground/50">Conferindo…</p>}

      {query.isError && (
        <p className="text-[11px] text-destructive">
          Não foi possível conferir agora. Tente novamente em instantes.
        </p>
      )}

      {!query.isLoading && !query.isError && rows.length === 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-foreground/55">
          <ShieldCheck className="size-3.5 text-primary" />
          Nenhuma referência repetida registrada.
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={`${row.propertyId}-${row.provider}`}
            className="rounded-xl bg-foreground/4 p-2.5 text-[11px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                {row.titulo ?? "Imóvel"} · {row.provider === "cordial" ? "Cordial" : "Morar"}
              </span>
              <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                {ESTADOS[row.createState ?? ""] ?? row.createState ?? "Conferir"}
              </span>
            </div>
            <p className="mt-1 text-foreground/60">
              Referência {row.reference}
              {row.matchCount != null ? ` · ${row.matchCount} anúncio(s) no site` : ""}
              {row.matchIds.length ? ` · códigos ${row.matchIds.join(", ")}` : ""}
              {row.canonicalId ? ` · registrado aqui: ${row.canonicalId}` : ""}
            </p>
            {row.checkedAt && (
              <p className="mt-0.5 text-[10px] text-foreground/40">
                conferido em {new Date(row.checkedAt).toLocaleString("pt-BR")}
              </p>
            )}
          </li>
        ))}
      </ul>

      {rows.length > 0 && (
        <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-destructive/8 p-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          Enquanto houver repetição, o sistema não cria novo cadastro para esse imóvel. A remoção da
          cópia errada é feita manualmente no painel do site.
        </p>
      )}
    </section>
  );
}
