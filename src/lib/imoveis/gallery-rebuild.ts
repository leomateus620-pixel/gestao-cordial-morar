/**
 * Reconstrução da ordem/capa da galeria no site (puro, sem I/O).
 *
 * A API não tem "reordenar" nem "trocar destaque" — mas TEM exclusão por código
 * (`/imovel/{codigoImovel}/imagem/excluir/{codigoImagem}`, conferido em
 * 22/09/2026). Então a ordem é corrigida pelo único caminho suportado: apagar do
 * primeiro ponto divergente para frente e reinserir na ordem correta, sempre a
 * partir dos arquivos guardados no Gestão.
 *
 * Regras duras:
 *  - nunca reconstruir sem o código remoto de TODAS as fotos envolvidas;
 *  - nunca apagar foto remota que não tenha par local confirmado (foto antiga
 *    de versões anteriores é assunto de limpeza manual);
 *  - o menor trabalho possível: prefixo já correto é preservado.
 */

export type RebuildRemoteItem = {
  /** Código da foto no site. `null` = desconhecido: bloqueia a reconstrução. */
  codigoImagem: string | null;
  /** Foto local correspondente, quando o vínculo é conhecido. */
  imageId: string | null;
  destaque: boolean;
};

export type GalleryRebuildPlan = {
  /** Reconstrução necessária? */
  needed: boolean;
  /** Reconstrução possível com os dados atuais? */
  feasible: boolean;
  /** Motivo quando não é possível (aparece na tela). */
  reason: string | null;
  /** Códigos remotos a excluir, na ordem. */
  deleteRemoteIds: string[];
  /** Fotos locais a reinserir, na ordem correta. */
  reinsertImageIds: string[];
  /** Quantas fotos do começo já estão na ordem certa. */
  keptPrefix: number;
};

const EMPTY: GalleryRebuildPlan = {
  needed: false,
  feasible: true,
  reason: null,
  deleteRemoteIds: [],
  reinsertImageIds: [],
  keptPrefix: 0,
};

export function planGalleryRebuild(params: {
  /** Fotos locais publicáveis, já na ordem escolhida no Gestão. */
  desiredImageIds: readonly string[];
  /** Galeria do site na ordem de inserção. */
  remote: readonly RebuildRemoteItem[];
}): GalleryRebuildPlan {
  const desired = [...params.desiredImageIds];
  // Somente as fotos do site que têm par local entram na comparação de ordem.
  const mapped = params.remote.filter(
    (item) => item.imageId !== null && desired.includes(item.imageId),
  );
  if (!desired.length || !mapped.length) return EMPTY;

  const remoteOrder = mapped.map((item) => item.imageId as string);
  const coverIsFirst = (() => {
    const covers = mapped.filter((item) => item.destaque);
    if (covers.length !== 1) return covers.length === 0 ? false : false;
    return covers[0]!.imageId === desired[0];
  })();
  const multipleCovers = mapped.filter((item) => item.destaque).length > 1;

  // Prefixo já correto (quando a capa também está certa).
  let keptPrefix = 0;
  if (coverIsFirst && !multipleCovers) {
    while (
      keptPrefix < remoteOrder.length &&
      keptPrefix < desired.length &&
      remoteOrder[keptPrefix] === desired[keptPrefix]
    ) {
      keptPrefix += 1;
    }
  }

  const tail = mapped.slice(keptPrefix);
  const needed = tail.length > 0 && !(keptPrefix === remoteOrder.length && keptPrefix === desired.length);
  if (!needed) return { ...EMPTY, keptPrefix };

  const missingCode = tail.find((item) => !item.codigoImagem);
  if (missingCode) {
    return {
      needed: true,
      feasible: false,
      reason: "codigo_remoto_desconhecido",
      deleteRemoteIds: [],
      reinsertImageIds: [],
      keptPrefix,
    };
  }

  return {
    needed: true,
    feasible: true,
    reason: null,
    deleteRemoteIds: tail.map((item) => item.codigoImagem as string),
    reinsertImageIds: desired.slice(keptPrefix),
    keptPrefix,
  };
}

/**
 * Galeria do site bate EXATAMENTE com a escolhida no Gestão: mesma quantidade,
 * mesmas fotos, mesma ordem e uma só capa (a primeira). Galeria vazia nunca
 * conta como concluída quando há fotos a publicar.
 */
export function galleryMatchesExactly(params: {
  desiredImageIds: readonly string[];
  remote: readonly RebuildRemoteItem[];
}): boolean {
  const desired = params.desiredImageIds;
  const remote = params.remote;
  if (!desired.length) return remote.length === 0;
  if (remote.length !== desired.length) return false;
  for (let index = 0; index < desired.length; index += 1) {
    if (remote[index]!.imageId !== desired[index]) return false;
  }
  const covers = remote.filter((item) => item.destaque);
  return covers.length === 1 && covers[0]!.imageId === desired[0];
}
