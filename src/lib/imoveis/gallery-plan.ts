/**
 * Regras (puras) da galeria enviada aos sites.
 *
 * Contexto verificado na integração ImobiBrasil (17/09/2026): existem apenas
 * dois recursos de imagem — listar e inserir. Não há recurso oficial de
 * excluir, reordenar ou definir destaque isoladamente. Logo:
 *
 *  - a ordem remota é a ordem de inserção;
 *  - reenviar uma foto já enviada criaria uma cópia no site, então nunca
 *    reenviamos por mudança de ordem/capa — a divergência é registrada;
 *  - o sistema reconhece a divergência (posição 7 → 2 conta como mudança de
 *    mídia) e informa o nível de garantia possível.
 *
 * Nada aqui faz rede ou banco: é o miolo testável do envio.
 */

export type LocalGalleryImage = {
  id: string;
  position: number;
  isCover: boolean;
  deliveredHash: string | null;
};

export type RemoteGalleryRow = {
  image_id: string;
  content_hash: string | null;
  status: string | null;
  synced_position: number | null;
  is_cover: boolean | null;
  attempts: number | null;
  next_retry_at: string | null;
};

export type GalleryPlan = {
  /** Fotos a inserir no site, já na ordem definida pelo usuário. */
  toSend: LocalGalleryImage[];
  /** Fotos com falha cuja espera programada ainda não venceu. */
  waiting: string[];
  /** Fotos com entrega ambígua: só podem ser conferidas por leitura. */
  unknown: string[];
  /**
   * Fotos já sincronizadas cujo binário local mudou depois do envio (marca
   * d'água / reprocessamento). NUNCA são reenviadas: o site só insere, então
   * reenviar criaria uma cópia permanente.
   */
  contentDrift: string[];
  expectedCount: number;
  syncedCount: number;
  failedCount: number;
  /** A ordem local não corresponde à ordem em que as fotos foram inseridas. */
  orderDrift: boolean;
  /** A capa local não é o destaque registrado no site. */
  coverDrift: boolean;
};

/** Ordem determinística: sempre a ordem escolhida no Gestão. */
export function sortGallery(images: readonly LocalGalleryImage[]): LocalGalleryImage[] {
  return [...images].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
}

export function planGalleryDelivery(
  images: readonly LocalGalleryImage[],
  remote: readonly RemoteGalleryRow[],
  now: number = Date.now(),
): GalleryPlan {
  const ordered = sortGallery(images);
  const index = new Map(remote.map((row) => [row.image_id, row]));

  const toSend: LocalGalleryImage[] = [];
  const waiting: string[] = [];
  const unknown: string[] = [];
  const contentDrift: string[] = [];
  let syncedCount = 0;
  let failedCount = 0;

  for (const image of ordered) {
    const existing = index.get(image.id);
    if (!existing) {
      toSend.push(image);
      continue;
    }
    // REGRA DURA (19/09/2026): uma foto já sincronizada NUNCA é inserida de
    // novo — nem por mudança de checksum (marca d'água), nem por mudança de
    // ordem ou de capa. A API só possui inserir, então qualquer reenvio vira
    // cópia permanente no site. Substituição real = novo property_images.id.
    if (existing.status === "synced") {
      syncedCount += 1;
      const sameFile = (existing.content_hash ?? null) === (image.deliveredHash ?? null);
      if (!sameFile) contentDrift.push(image.id);
      continue;
    }
    // Entrega ambígua (timeout/rede depois do POST): só leitura resolve.
    if (existing.status === "delivery_unknown") {
      unknown.push(image.id);
      continue;
    }
    if (existing.status === "error") failedCount += 1;

    // Falha com nova tentativa programada: respeita a espera.
    if (existing.status === "error" && existing.next_retry_at) {
      if (new Date(existing.next_retry_at).getTime() > now) {
        waiting.push(image.id);
        continue;
      }
    }
    toSend.push(image);
  }

  // Divergência de ordem: entre as fotos já sincronizadas, a sequência de
  // inserção precisa acompanhar a ordem local. Não há como corrigir isso pela
  // API sem duplicar a foto, então apenas detectamos.
  const syncedPositions = ordered
    .map((image) => index.get(image.id))
    .filter(
      (row): row is RemoteGalleryRow =>
        Boolean(row) && row!.status === "synced" && typeof row!.synced_position === "number",
    )
    .map((row) => row.synced_position as number);
  let orderDrift = false;
  for (let i = 1; i < syncedPositions.length; i += 1) {
    if (syncedPositions[i]! <= syncedPositions[i - 1]!) {
      orderDrift = true;
      break;
    }
  }

  const localCover = ordered.find((image) => image.isCover) ?? ordered[0];
  const coverRow = localCover ? index.get(localCover.id) : undefined;
  const coverDrift = Boolean(
    coverRow && coverRow.status === "synced" && coverRow.is_cover === false,
  );

  return {
    toSend,
    waiting,
    unknown,
    contentDrift,
    expectedCount: ordered.length,
    syncedCount,
    failedCount,
    orderDrift,
    coverDrift,
  };
}

const SAFE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

/**
 * Nome do arquivo entregue no multipart.
 *
 * O site recusa "A extensão da imagem é inválida!" quando o nome traz extensão
 * em maiúsculas ou incompatível com o conteúdo (ex.: `DJI_0765.JPG` para um
 * JPEG convertido). O original do usuário nunca é alterado — isto vale apenas
 * para a cópia enviada.
 */
export function safeDeliveryFileName(
  imageId: string,
  options: { converted?: boolean; originalName?: string | null; mimeType?: string | null } = {},
): string {
  const id = imageId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40) || "foto";
  if (options.converted) return `${id}.jpg`;

  const mime = (options.mimeType ?? "").toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg") return `${id}.jpg`;
  if (mime === "image/png") return `${id}.png`;
  if (mime === "image/webp") return `${id}.webp`;

  const raw = (options.originalName ?? "").toLowerCase();
  const ext = raw.includes(".") ? raw.slice(raw.lastIndexOf(".") + 1) : "";
  if (SAFE_EXTENSIONS.has(ext)) return `${id}.${ext === "jpeg" ? "jpg" : ext}`;
  return `${id}.jpg`;
}

/** Erro de extensão é corrigível pelo próprio pipeline: nunca fica parado. */
export function isExtensionError(message: string | null | undefined): boolean {
  return /extens[aã]o da imagem/i.test(message ?? "");
}

/** Erro de limite de requisições do site (20 por minuto). */
export function isRateLimitError(message: string | null | undefined): boolean {
  return /m[aá]ximo de \d+ requisi|rate limit|too many requests|429/i.test(message ?? "");
}

/**
 * Entrega ambígua: timeout, queda de rede ou 5xx DEPOIS de o POST sair. O site
 * pode ter aceitado a foto, então repetir o POST criaria cópia.
 */
export function isAmbiguousDeliveryError(error: {
  category?: string | null;
  ambiguous?: boolean | null;
  status?: number | null;
}): boolean {
  if (error.ambiguous) return true;
  if (error.category === "network") return true;
  if (error.category === "server") return true;
  return typeof error.status === "number" && error.status >= 500;
}

/** Uma foto do site está marcada como destaque? Aceita boolean, "Sim", 1. */
export function isRemoteCover(item: Record<string, unknown>): boolean {
  for (const key of ["destaque", "imagemDestaque", "destaqueImagem", "is_cover", "principal"]) {
    const value = item[key];
    if (value === true || value === 1) return true;
    if (typeof value === "string" && /^(sim|s|1|true)$/i.test(value.trim())) return true;
  }
  return false;
}

export type RemoteGallerySnapshot = {
  count: number;
  coverCount: number;
  /** 2+ destaques fazem o site repetir o mesmo imóvel na listagem. */
  multipleCovers: boolean;
};

export function analyzeRemoteGallery(
  items: readonly Record<string, unknown>[] | null | undefined,
): RemoteGallerySnapshot | null {
  if (!items) return null;
  const coverCount = items.filter((item) => isRemoteCover(item)).length;
  return { count: items.length, coverCount, multipleCovers: coverCount > 1 };
}

/**
 * Só pode existir UM destaque no site. A API não permite remover destaque, então
 * o segundo `destaque=Sim` faria o imóvel aparecer duplicado na listagem.
 * Destaque=Sim apenas quando está comprovado que a galeria remota não tem nenhum.
 */
export function shouldSendAsCover(params: {
  remote: RemoteGallerySnapshot | null;
  localIsCover: boolean;
  coversSentThisRun: number;
}): boolean {
  const { remote, localIsCover, coversSentThisRun } = params;
  if (!remote) return false; // leitura falhou: nunca arrisca um segundo destaque
  if (remote.coverCount > 0) return false; // já existe destaque: nunca criar o segundo
  if (coversSentThisRun > 0) return false;
  return localIsCover;
}
