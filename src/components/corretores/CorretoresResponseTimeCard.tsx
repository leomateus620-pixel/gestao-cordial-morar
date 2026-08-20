import { AlertCircle, Clock3, Timer, Zap } from "lucide-react";
import { formatElapsedSeconds } from "@/lib/time/elapsed";
import type { Corretor, CorretorSourceStatus } from "@/types/corretor";

type CorretoresResponseTimeCardProps = {
  corretores: Corretor[];
  sourceStatus: CorretorSourceStatus;
  isLoading: boolean;
  isError: boolean;
};

export function CorretoresResponseTimeCard({
  corretores,
  sourceStatus,
  isLoading,
  isError,
}: CorretoresResponseTimeCardProps) {
  const sourceError = isError || sourceStatus.respostas === "error";
  const measured = corretores
    .filter(
      (corretor) =>
        corretor.medianaRespostaSegundos != null &&
        Number.isFinite(corretor.medianaRespostaSegundos) &&
        corretor.medianaRespostaSegundos >= 0 &&
        corretor.respostasMedidas > 0,
    )
    .sort(
      (a, b) =>
        (a.medianaRespostaSegundos ?? Number.POSITIVE_INFINITY) -
        (b.medianaRespostaSegundos ?? Number.POSITIVE_INFINITY),
    );
  const bestAverage = measured[0] ?? null;
  const totalPending = corretores.reduce(
    (total, corretor) => total + Math.max(0, corretor.respostasPendentes),
    0,
  );
  const totalLate = corretores.reduce(
    (total, corretor) => total + Math.max(0, corretor.respostasForaDoPrazo),
    0,
  );

  return (
    <article className="premium-card min-w-0 p-4 sm:p-5" aria-labelledby="response-time-title">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary/75">
            Tempo de resposta
          </p>
          <h2 id="response-time-title" className="mt-0.5 text-base font-semibold tracking-tight">
            Início dos atendimentos
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-foreground/58">
            Mediana entre a atribuição e o primeiro acesso persistido pelo corretor. A mediana evita
            a distorção causada por casos isolados muito demorados.
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Timer className="size-5" aria-hidden />
        </span>
      </div>

      {isLoading && <ResponseSkeleton />}

      {!isLoading && sourceError && (
        <ResponseNotice
          tone="error"
          title="Tempo de resposta indisponível"
          description="A fonte de notificações e aberturas não respondeu. Nenhuma duração foi estimada no navegador."
        />
      )}

      {!isLoading && !sourceError && measured.length === 0 && (
        <ResponseNotice
          title="Dados insuficientes para calcular a mediana"
          description={
            totalPending > 0
              ? `${totalPending} atendimento${totalPending === 1 ? "" : "s"} ainda aguardando abertura. A mediana aparecerá quando houver atribuição e primeira ação persistidas.`
              : "Nenhum atendimento deste recorte possui atribuição e primeira ação persistidas para o mesmo ciclo."
          }
        />
      )}

      {!isLoading && !sourceError && measured.length > 0 && (
        <>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            <MiniStat
              icon={<Zap className="size-3.5 text-primary/75" aria-hidden />}
              label="Melhor mediana"
              name={bestAverage?.nome ?? "—"}
              value={formatDuration(bestAverage?.medianaRespostaSegundos)}
            />
            <MiniStat
              icon={<Clock3 className="size-3.5 text-primary/75" aria-hidden />}
              label="Pendentes / fora do prazo"
              name={`${totalLate} acima de 72h`}
              value={String(totalPending)}
            />
          </div>

          <ol className="space-y-2" aria-label="Mediana de resposta por corretor">
            {measured.slice(0, 6).map((corretor, index) => (
              <li
                key={corretor.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border/45 bg-background/58 px-3 py-2.5"
              >
                <span
                  className="grid size-8 place-items-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{corretor.nome}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-foreground/55">
                    {corretor.respostasMedidas} ciclo
                    {corretor.respostasMedidas === 1 ? "" : "s"} medido
                    {corretor.respostasMedidas === 1 ? "" : "s"}
                    {corretor.respostasPendentes > 0
                      ? ` · ${corretor.respostasPendentes} pendente${
                          corretor.respostasPendentes === 1 ? "" : "s"
                        }`
                      : ""}
                    {corretor.respostasForaDoPrazo > 0
                      ? ` · ${corretor.respostasForaDoPrazo} acima de 72h`
                      : ""}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-mono text-sm font-bold text-primary">
                    {formatDuration(corretor.medianaRespostaSegundos)}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.12em] text-foreground/42">
                    mediana
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </article>
  );
}

function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  return formatElapsedSeconds(Math.round(seconds));
}

function MiniStat({
  icon,
  label,
  name,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  name: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/45 bg-background/58 p-3">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/52">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold">{name}</p>
        <p className="shrink-0 font-mono text-base font-bold text-primary">{value}</p>
      </div>
    </div>
  );
}

function ResponseNotice({
  title,
  description,
  tone = "empty",
}: {
  title: string;
  description: string;
  tone?: "empty" | "error";
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border border-dashed px-4 py-6 text-center ${
        tone === "error"
          ? "border-destructive/25 bg-destructive/[0.035]"
          : "border-border/70 bg-background/45"
      }`}
    >
      <AlertCircle
        className={`mx-auto size-5 ${
          tone === "error" ? "text-destructive/65" : "text-foreground/35"
        }`}
        aria-hidden
      />
      <p className="mt-2 text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-foreground/55">
        {description}
      </p>
    </div>
  );
}

function ResponseSkeleton() {
  return (
    <div role="status" aria-label="Carregando tempos de resposta" className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {[0, 1].map((item) => (
          <div
            key={item}
            aria-hidden
            className="h-20 animate-pulse rounded-xl bg-foreground/[0.06] motion-reduce:animate-none"
          />
        ))}
      </div>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden
          className="h-14 animate-pulse rounded-xl bg-foreground/[0.06] motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
