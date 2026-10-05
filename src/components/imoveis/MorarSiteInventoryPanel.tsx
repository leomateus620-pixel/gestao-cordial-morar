import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  loadSiteInventory,
  reviewSiteBatch,
  type MorarInventoryItem,
} from "@/lib/morar-site/admin.functions";

const button =
  "rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";
const initialChecks = {
  authorize: false,
  available: false,
  content: false,
  media: false,
  areas: false,
};
const labels: Record<keyof typeof initialChecks, string> = {
  authorize: "Autorização para publicação na Morar confirmada para todos os selecionados",
  available: "Disponibilidade comercial confirmada para todos os selecionados",
  content: "Descrições, características e exposição de endereço revisadas",
  media: "Fotos, associação, ordem, direitos e marcas revisados",
  areas: "Áreas cadastradas conferidas em metros quadrados (opcional)",
};
const eligible = (item: MorarInventoryItem) => item.candidate && item.blockers.length === 0;
const blockerLabels: Record<string, string> = {
  no_active_morar_intent: "Sem vínculo Morar ativo autorizado",
  draft: "Rascunho",
  hidden: "Oculto no cadastro",
  authorization_denied: "Autorização negada",
  retired: "Arquivado ou em retirada",
  unavailable: "Indisponível comercialmente",
  invalid_operation: "Finalidade inválida",
  registration_incomplete: "Cadastro não concluído",
  manually_withdrawn: "Retirada manual do site",
  manual_withdrawn: "Retirada manual do site",
  manual_withdrawal: "Retirada manual do site",
  snapshot_changed: "Cadastro alterado após o levantamento",
  canonical_block: "Bloqueio no cadastro",
  authorization_review_required: "Confirmar autorização",
  availability_review_required: "Confirmar disponibilidade",
  missing: "Imóvel não encontrado",
};
const blockerLabel = (code: string) => blockerLabels[code] ?? code;

export function MorarSiteInventoryPanel({ onSaved }: { onSaved: () => Promise<unknown> }) {
  const load = useServerFn(loadSiteInventory);
  const review = useServerFn(reviewSiteBatch);
  const [inventory, setInventory] = useState<MorarInventoryItem[]>([]);
  const [complete, setComplete] = useState(false);
  const [total, setTotal] = useState(0);
  const [progress, setProgress] = useState(0);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checks, setChecks] = useState(initialChecks);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [simulation, setSimulation] = useState<{
    batchId: string;
    fingerprint: string;
    ready: boolean;
    snapshotHash: string;
    blockers: Array<{ propertyId: string; blockers: string[] }>;
  } | null>(null);
  const chosen = useMemo(
    () => inventory.filter((item) => selected.has(item.propertyId)),
    [inventory, selected],
  );
  const items = chosen.map(({ propertyId, revision, snapshotHash }) => ({
    propertyId,
    revision,
    snapshotHash,
  }));
  const fingerprint = JSON.stringify({ items, checks });
  const approved = checks.authorize && checks.available && checks.content && checks.media;
  const candidates = inventory.filter(eligible);

  async function gather() {
    setPending(true);
    setError("");
    setMessage("");
    setComplete(false);
    setProgress(0);
    setSimulation(null);
    const collected = new Map<string, MorarInventoryItem>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let expectedTotal: number | null = null;
    try {
      for (let requests = 0; requests < 100; requests++) {
        const response = await load({ data: { cursor } });
        if (expectedTotal !== null && expectedTotal !== response.total)
          throw new Error(
            "A quantidade do inventário mudou durante a leitura. Levante novamente antes de revisar.",
          );
        expectedTotal = response.total;
        setTotal(response.total);
        for (const item of response.items) {
          const prior = collected.get(item.propertyId);
          if (prior && prior.snapshotHash !== item.snapshotHash)
            throw new Error(
              "O inventário mudou durante a leitura. Levante novamente antes de revisar.",
            );
          collected.set(item.propertyId, item);
        }
        setProgress(collected.size);
        if (!response.nextCursor) {
          if (collected.size !== expectedTotal)
            throw new Error(
              "A leitura não cobriu o total informado. Nenhum imóvel foi publicado; levante o inventário novamente.",
            );
          setInventory([...collected.values()]);
          setComplete(true);
          setSelected(new Set());
          setPage(0);
          setMessage("Inventário integral levantado. Nenhum imóvel foi publicado.");
          return;
        }
        if (seenCursors.has(response.nextCursor))
          throw new Error("Paginação inconsistente. Nenhum imóvel foi publicado.");
        seenCursors.add(response.nextCursor);
        cursor = response.nextCursor;
      }
      throw new Error(
        "O inventário ultrapassou o limite desta revisão. Não foi tratado como levantamento completo.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível levantar o inventário.");
    } finally {
      setPending(false);
    }
  }

  async function simulate() {
    setPending(true);
    setError("");
    setMessage("");
    setSimulation(null);
    try {
      const batchId = crypto.randomUUID();
      const result = await review({ data: { batchId, items, dryRun: true, ...checks } });
      setSimulation({
        batchId,
        fingerprint,
        ready: result.ready === true,
        snapshotHash: result.snapshotHash,
        blockers: result.items
          .filter((item) => item.blockers?.length)
          .map((item) => ({ propertyId: item.propertyId, blockers: item.blockers ?? [] })),
      });
      setMessage(
        result.ready === true
          ? `Simulação pronta: ${items.length} imóveis revisados. Nenhuma escrita foi realizada.`
          : "O lote ainda contém pendências. Confira as confirmações e levante novamente se o cadastro mudou.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "A simulação falhou.");
    } finally {
      setPending(false);
    }
  }

  async function apply() {
    if (!simulation || simulation.fingerprint !== fingerprint || !simulation.ready || !approved)
      return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await review({
        data: { batchId: simulation.batchId, items, dryRun: false, ...checks },
      });
      if (result.applied !== items.length)
        throw new Error(
          "A aplicação não foi confirmada. Confira o histórico; mantenha esta identificação para repetir com segurança.",
        );
      await onSaved();
      setComplete(false);
      setSimulation(null);
      setSelected(new Set());
      setMessage(
        `Lote de ${items.length} imóveis aplicado e registrado. Fotos pendentes só aparecerão após processamento interno. Levante o inventário novamente para conferir o estado atualizado.`,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Aplicação não confirmada. O lote mantém a identificação para repetição segura.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-5" aria-label="Inventário e ativação Morar">
      <div className="rounded-xl border bg-card p-5 text-sm">
        <h2 className="font-semibold">Reconciliação e ativação revisável</h2>
        <p className="mt-2">
          O vínculo histórico ou a carteira de origem não autorizam publicação. Autorização e
          disponibilidade desconhecidas exigem confirmação própria. Rascunhos, ocultos, retirados e
          bloqueios comerciais ficam excluídos.
        </p>
        <button className={`${button} mt-4`} disabled={pending} onClick={() => void gather()}>
          Levantar inventário completo
        </button>
        {pending && !complete && (
          <p role="status" className="mt-2">
            Leitura: {progress} de {total || "…"} registros.
          </p>
        )}
      </div>
      {complete && (
        <>
          <p className="text-sm">
            {inventory.length} registros levantados · {candidates.length} candidatos sem bloqueios ·{" "}
            {inventory.length - candidates.length} excluídos · {chosen.length} selecionados.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              className={button}
              disabled={pending}
              onClick={() =>
                setSelected(new Set(candidates.slice(0, 500).map((item) => item.propertyId)))
              }
            >
              Selecionar até 500 candidatos sem bloqueios
            </button>
            <button
              className="rounded-lg border px-4 py-2 text-sm"
              disabled={pending}
              onClick={() => setSelected(new Set())}
            >
              Limpar seleção
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <caption className="p-3 text-left">
                Inventário restrito à administração. Página {page + 1} de{" "}
                {Math.max(1, Math.ceil(inventory.length / 50))}.
              </caption>
              <thead>
                <tr className="border-b bg-muted">
                  <th className="p-3">Selecionar</th>
                  <th className="p-3">Referência Morar</th>
                  <th className="p-3">Revisão necessária / exclusão</th>
                </tr>
              </thead>
              <tbody>
                {inventory.slice(page * 50, page * 50 + 50).map((item) => (
                  <tr key={item.propertyId} className="border-b last:border-0">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${item.reference || item.propertyId}`}
                        disabled={
                          pending ||
                          !eligible(item) ||
                          (!selected.has(item.propertyId) && selected.size >= 500)
                        }
                        checked={selected.has(item.propertyId)}
                        onChange={(e) =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (e.target.checked) next.add(item.propertyId);
                            else next.delete(item.propertyId);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="p-3">
                      {item.reference || "Sem código comercial"}
                      <span className="block text-xs text-muted-foreground">
                        {item.source ?? "Origem pendente"} · revisão {item.revision}
                      </span>
                    </td>
                    <td className="p-3">
                      {item.blockers.length
                        ? item.blockers.map(blockerLabel).join(" · ")
                        : [
                            item.requiresAuthorizationReview
                              ? "Autorização desconhecida"
                              : "Autorização confirmada",
                            item.requiresAvailabilityReview
                              ? "Disponibilidade desconhecida"
                              : "Disponibilidade confirmada",
                          ].join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button
              className={button}
              disabled={pending || page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <button
              className={button}
              disabled={pending || (page + 1) * 50 >= inventory.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
          <fieldset className="space-y-3 rounded-xl border p-5">
            <legend className="px-2 text-sm font-semibold">Confirmações do lote selecionado</legend>
            <p className="text-sm">
              {chosen.filter((item) => item.requiresAuthorizationReview).length} autorizações e{" "}
              {chosen.filter((item) => item.requiresAvailabilityReview).length} disponibilidades
              precisam de confirmação explícita. Estas decisões são registradas no canal próprio;
              valores negativos do cadastro continuam bloqueando publicação.
            </p>
            {(Object.keys(labels) as Array<keyof typeof initialChecks>).map((key) => (
              <label key={key} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  disabled={pending}
                  checked={checks[key]}
                  onChange={(e) =>
                    setChecks((previous) => ({ ...previous, [key]: e.target.checked }))
                  }
                />
                {labels[key]}
              </label>
            ))}
          </fieldset>
          {simulation && (
            <div className="space-y-2 rounded-xl border p-4 text-sm">
              <p>
                Identificação da revisão: <code>{simulation.snapshotHash}</code>
              </p>
              <p>
                Lote: <code>{simulation.batchId}</code>. Alterar seleção ou confirmações exige uma
                nova simulação.
              </p>
              {simulation.blockers.map((item) => (
                <p key={item.propertyId}>
                  Ref.{" "}
                  {inventory.find((row) => row.propertyId === item.propertyId)?.reference ||
                    "Sem código"}
                  : {item.blockers.map(blockerLabel).join(" · ")}
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              className={button}
              disabled={pending || chosen.length === 0}
              onClick={() => void simulate()}
            >
              Simular sem gravar
            </button>
            <button
              className={button}
              disabled={
                pending || !approved || !simulation?.ready || simulation.fingerprint !== fingerprint
              }
              onClick={() => void apply()}
            >
              Autorizar e aplicar lote revisado
            </button>
          </div>
        </>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
