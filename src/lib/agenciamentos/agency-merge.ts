/** Campos do agenciamento que o cadastro do imóvel pode preencher. */
export const AGENCY_FLAG_COLUMNS = [
  "fotos_horizontal",
  "fotos_vertical",
  "fotos_realizadas",
  "fotos_drive",
  "placa_instalada",
  "video_realizado",
] as const;

type Row = Record<string, unknown>;

/**
 * Reenviar o cadastro nunca apaga o que já foi gravado no agenciamento:
 * item marcado continua marcado e descrição vazia não substitui a gravada.
 */
export function mergeAgencyUpdate<T extends Row>(existing: Row, incoming: T): T {
  const out: Row = { ...incoming };
  for (const col of AGENCY_FLAG_COLUMNS) {
    if (existing[col] === true) out[col] = true;
  }
  const desc = typeof incoming.descricao_imovel === "string" ? incoming.descricao_imovel.trim() : "";
  if (!desc && typeof existing.descricao_imovel === "string" && existing.descricao_imovel.trim()) {
    out.descricao_imovel = existing.descricao_imovel;
  }
  if (existing.placa_instalada === true) {
    delete out.placa_foto_path;
    delete out.placa_foto_mime;
    delete out.placa_foto_uploaded_at;
  }
  return out as T;
}

/** Estado da etapa de agenciamento a partir do registro já salvo. */
export function agencyStepFromRow(row: Row) {
  return {
    finalidade: row.finalidade,
    descricao: typeof row.descricao_imovel === "string" ? row.descricao_imovel : "",
    checklist: {
      fotosHorizontal: row.fotos_horizontal === true,
      fotosVertical: row.fotos_vertical === true,
      fotosDrive: row.fotos_drive === true,
      placaInstalada: row.placa_instalada === true,
      cadastradoMorar: row.cadastrado_morar === true,
      cadastradoCordial: row.cadastrado_cordial === true,
      videoRealizado: row.video_realizado === true,
      validado: row.validado === true,
    },
  };
}
