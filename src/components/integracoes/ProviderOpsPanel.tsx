import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, Camera, Copy, RotateCcw, ShieldCheck } from "lucide-react";
import {
  getProviderOps,
  listFieldConflicts,
  listDuplicateDiagnosis,
  resolveFieldConflict,
  retryPublication,
} from "@/lib/imobibrasil/ops.functions";

const CONEXAO: Record<string, string> = {
  ok: "Conexão em ordem",
  pausado: "Envio pausado",
  sem_credencial: "Bloqueado",
  com_erros: "Com pendências",
};

const CLASSES: Record<string, string> = {
  duplicacao_local: "Duplicação no Gestão",
  ids_diferentes_mesma_conta: "Dois anúncios na mesma imobiliária",
  repeticao_visual: "Repetição só na exibição",
  publicacao_legitima_nas_duas: "Publicação nas duas imobiliárias",
};

function nomeImobiliaria(provider: string) {
  return provider === "cordial" ? "Cordial" : "Morar";
}

function valor(value: unknown) {
  if (value === null || value === undefined || value === "") return "(vazio)";
  return String(value);
}

/**
 * Painel interno de operação por imobiliária. Não aparece em nenhuma página
 * pública: fica em Integrações e somente para administradores.
 */
export function ProviderOpsPanel({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const loadOps = useServerFn(getProviderOps);
  const loadConflicts = useServerFn(listFieldConflicts);
  const loadDuplicates = useServerFn(listDuplicateDiagnosis);
  const resolver = useServerFn(resolveFieldConflict);
  const retry = useServerFn(retryPublication);

  const ops = useQuery({
    queryKey: ["provider-ops"],
    queryFn: () => loadOps({}),
    enabled,
    staleTime: 30_000,
  });
  const conflicts = useQuery({
    queryKey: ["provider-ops-conflicts"],
    queryFn: () => loadConflicts({}),
    enabled,
    staleTime: 30_000,
  });
  const duplicates = useQuery({
    queryKey: ["provider-ops-duplicates"],
    queryFn: () => loadDuplicates({}),
    enabled,
    staleTime: 60_000,
  });

  const resolverMutation = useMutation({
    mutationFn: (input: { id: string; decisao: "manter_site" | "reenviar_gestao" }) =>
      resolver({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-ops-conflicts"] });
      queryClient.invalidateQueries({ queryKey: ["provider-ops"] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (publicationId: string) => retry({ data: { publicationId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["provider-ops"] }),
  });

  if (!enabled) return null;

  const summaries = ops.data?.summaries ?? [];
  const items = ops.data?.items ?? [];
  const conflictRows = conflicts.data ?? [];
  const duplicateRows = duplicates.data ?? [];

  return (
    <section className="mb-5 rounded-2xl border border-border/60 bg-card p-4">
      <header className="mb-3 flex items-center gap-2">
        <Activity className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Operação por imobiliária (uso interno)</h2>
      </header>

      {ops.isLoading && <p className="text-[11px] text-foreground/50">Conferindo…</p>}
      {ops.isError && (
        <p className="text-[11px] text-destructive">
          Não foi possível carregar agora. Tente novamente em instantes.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {summaries.map((resumo) => (
          <article key={resumo.provider} className="rounded-xl bg-foreground/4 p-3 text-[11px]">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{nomeImobiliaria(resumo.provider)}</span>
              <span
                className={
                  "rounded-full px-2 py-0.5 text-[10px] font-medium " +
                  (resumo.conexao === "ok"
                    ? "bg-primary/15 text-primary"
                    : "bg-destructive/15 text-destructive")
                }
              >
                {CONEXAO[resumo.conexao] ?? resumo.conexao}
              </span>
            </div>
            <ul className="space-y-0.5 text-foreground/70">
              <li>Cadastro confirmado na imobiliária: {resumo.cadastroConfirmado}</li>
              <li>Confirmado, mas sem link público: {resumo.semExibicaoPublica}</li>
              <li>Fotos pendentes: {resumo.midiaPendente}</li>
              <li>Bloqueios: {resumo.bloqueios}</li>
              <li>Divergências: {resumo.conflitos}</li>
              <li>Envios na fila: {resumo.tentativasAbertas}</li>
              <li>
                Última confirmação:{" "}
                {resumo.ultimaConfirmacao
                  ? new Date(resumo.ultimaConfirmacao).toLocaleString("pt-BR")
                  : "—"}
              </li>
            </ul>
          </article>
        ))}
      </div>

      {conflictRows.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
            <AlertTriangle className="size-3.5 text-destructive" />
            Divergências para conferir
          </h3>
          <ul className="space-y-2">
            {conflictRows.map((row) => (
              <li key={row.id} className="rounded-xl bg-foreground/4 p-2.5 text-[11px]">
                <p className="font-semibold">
                  {row.titulo ?? "Imóvel"} · {nomeImobiliaria(row.provider)} · {row.campo}
                </p>
                <p className="text-foreground/70">No Gestão era: {valor(row.valorGestao)}</p>
                <p className="text-foreground/70">
                  Na imobiliária está (mantido): {valor(row.valorSite)}
                </p>
                <div className="mt-1.5 flex gap-2">
                  <button
                    onClick={() =>
                      resolverMutation.mutate({ id: row.id, decisao: "manter_site" })
                    }
                    disabled={resolverMutation.isPending}
                    className="rounded-full bg-primary/15 px-2.5 py-1 font-medium text-primary"
                  >
                    Manter o da imobiliária
                  </button>
                  <button
                    onClick={() =>
                      resolverMutation.mutate({ id: row.id, decisao: "reenviar_gestao" })
                    }
                    disabled={resolverMutation.isPending}
                    className="rounded-full bg-foreground/8 px-2.5 py-1 font-medium"
                  >
                    Reenviar o do Gestão
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {duplicateRows.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
            <Copy className="size-3.5 text-primary" />
            Diagnóstico de duplicações (nada é excluído automaticamente)
          </h3>
          <ul className="space-y-2">
            {duplicateRows.map((row) => (
              <li key={row.propertyId} className="rounded-xl bg-foreground/4 p-2.5 text-[11px]">
                <p className="font-semibold">
                  {row.titulo ?? "Imóvel"} {row.codigo ? `· ${row.codigo}` : ""} ·{" "}
                  {CLASSES[row.classificacao] ?? row.classificacao}
                </p>
                <p className="text-foreground/70">{row.explicacao}</p>
                <ul className="mt-1 space-y-0.5 text-foreground/60">
                  {row.vinculos.map((vinculo, index) => (
                    <li key={`${vinculo.provider}-${index}`}>
                      {nomeImobiliaria(vinculo.provider)}: anúncio{" "}
                      {vinculo.externalPropertyId ?? "sem número"} · referência{" "}
                      {vinculo.externalReference ?? "—"} · fotos {vinculo.fotosNoSite ?? "—"}
                      {vinculo.idsRepetidos.length > 1
                        ? ` · anúncios pela mesma referência: ${vinculo.idsRepetidos.join(", ")}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold">
          <Camera className="size-3.5 text-primary" />
          Anúncios com pendência
        </h3>
        {items.filter((item) => item.motivo || !item.registradoNaApi).length === 0 ? (
          <p className="flex items-center gap-1.5 text-[11px] text-foreground/55">
            <ShieldCheck className="size-3.5 text-primary" />
            Nenhuma pendência registrada.
          </p>
        ) : (
          <ul className="space-y-2">
            {items
              .filter((item) => item.motivo || !item.registradoNaApi)
              .slice(0, 30)
              .map((item) => (
                <li key={item.publicationId} className="rounded-xl bg-foreground/4 p-2.5 text-[11px]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {item.titulo ?? "Imóvel"} · {nomeImobiliaria(item.provider)}
                      </p>
                      <p className="text-foreground/65">
                        {item.registradoNaApi
                          ? "Confirmado na imobiliária"
                          : "Ainda não confirmado na imobiliária"}
                        {" · "}
                        {item.exibidoPublicamente ? "Aparecendo no site" : "Sem link público"}
                      </p>
                      {item.motivo && <p className="text-destructive">{item.motivo}</p>}
                    </div>
                    <button
                      onClick={() => retryMutation.mutate(item.publicationId)}
                      disabled={retryMutation.isPending}
                      className="flex shrink-0 items-center gap-1 rounded-full bg-foreground/8 px-2.5 py-1 font-medium"
                    >
                      <RotateCcw className="size-3" />
                      Tentar de novo
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </section>
  );
}
