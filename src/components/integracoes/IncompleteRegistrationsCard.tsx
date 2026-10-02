import { Link } from "@tanstack/react-router";
import { ClipboardList, ShieldCheck } from "lucide-react";
import { useIncompleteRegistrations } from "@/hooks/useImoveis";

/** Lista SOMENTE LEITURA de cadastros do Gestão que não foram concluídos. */
export function IncompleteRegistrationsCard({ enabled }: { enabled: boolean }) {
  const query = useIncompleteRegistrations(enabled);
  if (!enabled) return null;
  const rows = query.data ?? [];

  return (
    <section className="mb-5 rounded-2xl border border-border/60 bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <ClipboardList className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Cadastros não concluídos</h2>
        {rows.length ? (
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
            {rows.length}
          </span>
        ) : null}
      </header>

      {query.isLoading && <p className="text-[11px] text-foreground/50">Conferindo…</p>}
      {query.isError && (
        <p className="text-[11px] text-destructive">Não foi possível conferir agora.</p>
      )}
      {!query.isLoading && !query.isError && rows.length === 0 && (
        <p className="flex items-center gap-1.5 text-[11px] text-foreground/55">
          <ShieldCheck className="size-3.5 text-primary" />
          Todos os cadastros estão concluídos.
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((row) => {
          const faltas = [
            row.isDraft ? "rascunho" : null,
            !row.hasAgenciamento ? "sem agenciamento" : null,
            !row.hasPublication ? "sem publicação" : null,
          ].filter(Boolean);
          const codigos = [
            row.codigoCordial ? `C ${row.codigoCordial}` : null,
            row.codigoMorar ? `M ${row.codigoMorar}` : null,
          ].filter(Boolean);
          return (
            <li key={row.id} className="rounded-xl bg-foreground/4 p-2.5 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {row.tipo ?? "Imóvel"}
                  {codigos.length ? ` · ${codigos.join(" / ")}` : " · sem código"}
                </span>
                <Link
                  to="/imoveis/$imovelId"
                  params={{ imovelId: row.id }}
                  className="font-semibold text-primary hover:underline"
                >
                  Abrir
                </Link>
              </div>
              <p className="mt-0.5 text-foreground/60">
                {[row.bairro, row.cidade].filter(Boolean).join(", ") || "Sem endereço"} · criado em{" "}
                {new Date(row.createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                {row.criadorNome ? ` por ${row.criadorNome}` : ""}
                {row.corretorNome ? ` · corretor ${row.corretorNome}` : ""}
              </p>
              <p className="mt-0.5 text-destructive">{faltas.join(" · ")}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
