import { isWorkspacePipelineStage, type WorkspacePipelineStage } from "./stage-workspace";

export type AttendanceBaseView = "funil" | "lista";
export type AttendanceWorkspaceView =
  | { kind: AttendanceBaseView }
  | { kind: "etapa"; stage: WorkspacePipelineStage; returnTo: AttendanceBaseView };

export function parseAttendanceWorkspace(search: {
  modo?: unknown;
  etapa?: unknown;
  origem?: unknown;
}) {
  const etapa = isWorkspacePipelineStage(search.etapa) ? search.etapa : undefined;
  const modo =
    search.modo === "lista" ? "lista" : search.modo === "etapa" && etapa ? "etapa" : "funil";
  const origem: AttendanceBaseView = search.origem === "lista" ? "lista" : "funil";
  return { modo, etapa, origem } as const;
}

export function attendanceWorkspaceView(
  search: ReturnType<typeof parseAttendanceWorkspace>,
): AttendanceWorkspaceView {
  return search.modo === "etapa" && search.etapa
    ? { kind: "etapa", stage: search.etapa, returnTo: search.origem }
    : { kind: search.modo === "lista" ? "lista" : "funil" };
}

/** Search updaters preserve ids, global filters and future route parameters. */
export function expandAttendanceStage<T extends { modo?: unknown; origem?: unknown }>(
  search: T,
  etapa: WorkspacePipelineStage,
) {
  return {
    ...search,
    modo: "etapa" as const,
    etapa,
    origem:
      search.modo === "etapa"
        ? search.origem === "lista"
          ? "lista"
          : "funil"
        : search.modo === "lista"
          ? "lista"
          : "funil",
  };
}
