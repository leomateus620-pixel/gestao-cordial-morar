import { atendimentoMatchesSearch, isAtendimentoOverdue } from "@/services/atendimentos";
import {
  FUNNEL_PIPELINE_STAGES,
  WAITING_PIPELINE_STAGE,
  type Atendimento,
  type PipelineStage,
} from "@/types/atendimento";

/** Archived records retain their existing treatment, outside the seven workspaces. */
export type WorkspacePipelineStage = Exclude<PipelineStage, "arquivado">;

export const WORKSPACE_PIPELINE_STAGES = [
  ...FUNNEL_PIPELINE_STAGES,
  WAITING_PIPELINE_STAGE,
] as readonly WorkspacePipelineStage[];

export function isWorkspacePipelineStage(value: unknown): value is WorkspacePipelineStage {
  return (
    typeof value === "string" && WORKSPACE_PIPELINE_STAGES.includes(value as WorkspacePipelineStage)
  );
}

/** Apply only the final client cut here: authorization and global filters precede this selector. */
export function groupAttendancesByStage(items: readonly Atendimento[], clienteId?: string) {
  const base = items.filter(
    (item) => !clienteId || item.clienteId === clienteId || item.clienteConvertidoId === clienteId,
  );
  const byStage: Record<PipelineStage, Atendimento[]> = {
    primeiro_contato: [],
    apresentando_solucao: [],
    visita: [],
    proposta: [],
    fechamento: [],
    perdido: [],
    em_espera: [],
    arquivado: [],
  };
  const counts: Record<PipelineStage, number> = {
    primeiro_contato: 0,
    apresentando_solucao: 0,
    visita: 0,
    proposta: 0,
    fechamento: 0,
    perdido: 0,
    em_espera: 0,
    arquivado: 0,
  };
  for (const item of base) {
    byStage[item.pipelineStage].push(item);
    counts[item.pipelineStage] += 1;
  }
  return { base, byStage, counts };
}

export type StageAttendanceSort = "retorno" | "atualizacao" | "criacao" | "nome";

const nameCollator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function timestamp(value?: string) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function newestFirst(a?: string, b?: string) {
  const left = timestamp(a);
  const right = timestamp(b);
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

/** Local search never changes the global stage counts or mutates the cached collection. */
export function selectStageAttendances(
  items: readonly Atendimento[],
  query: string,
  sort: StageAttendanceSort,
  now = new Date(),
): Atendimento[] {
  return items
    .filter((item) => atendimentoMatchesSearch(item, query))
    .sort((left, right) => {
      let compared = 0;
      if (sort === "nome") {
        compared = nameCollator.compare(left.clienteNome, right.clienteNome);
      } else if (sort === "criacao") {
        compared = newestFirst(left.criadoEm, right.criadoEm);
      } else if (sort === "atualizacao") {
        compared = newestFirst(left.atualizadoEm, right.atualizadoEm);
      } else {
        const leftAt = timestamp(left.proximoRetorno);
        const rightAt = timestamp(right.proximoRetorno);
        const leftRank = isAtendimentoOverdue(left, now) ? 0 : leftAt === null ? 2 : 1;
        const rightRank = isAtendimentoOverdue(right, now) ? 0 : rightAt === null ? 2 : 1;
        compared =
          leftRank - rightRank || (leftAt !== null && rightAt !== null ? leftAt - rightAt : 0);
      }
      return compared || left.id.localeCompare(right.id);
    });
}
