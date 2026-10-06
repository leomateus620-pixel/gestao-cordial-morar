import { numeroPrecheckMessage } from "@/lib/imobibrasil/address-precheck";

const IMOBI_NUMERO_RE = /n[uú]mero do endere[cç]o deve conter no m[aá]ximo 15/i;
const LOCAL_NUMERO_RE = /N[uú]mero do endere[cç]o com (\d+) caracteres/i;

/** Traduz o erro de número (local ou do site) para a mensagem amigável. */
export function friendlyPublishError(
  message: string | null | undefined,
  numero?: string | null,
): { text: string; editAddress: boolean } | null {
  if (!message) return null;
  const local = message.match(LOCAL_NUMERO_RE);
  if (local) return { text: numeroPrecheckMessage(Number(local[1])), editAddress: true };
  if (IMOBI_NUMERO_RE.test(message)) {
    const len = (numero ?? "").trim().length;
    return { text: numeroPrecheckMessage(len > 15 ? len : 16).replace(/com \d+ caracteres/, len > 15 ? `com ${len} caracteres` : "acima do limite"), editAddress: true };
  }
  return { text: message, editAddress: false };
}

/** Texto da próxima execução: horário passado não é exibido. */
export function nextRunLabel(
  job: { action?: string | null; nextRunAt: string | null } | null | undefined,
  hasExternalId: boolean,
  now = Date.now(),
  fmt: (iso: string) => string = (iso) => new Date(iso).toLocaleString("pt-BR"),
): string | null {
  if (!job) return null;
  if (job.action === "media_sync" && !hasExternalId) return "Fotos aguardando a criação do anúncio";
  if (!job.nextRunAt) return null;
  if (new Date(job.nextRunAt).getTime() <= now) return null;
  return `Próxima execução: ${fmt(job.nextRunAt)}`;
}
