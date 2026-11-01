/**
 * Camada de provedor de edição (somente servidor). A interface isola a tela do fornecedor,
 * permitindo trocar ou comparar provedores no futuro.
 */
import { REALCE_NATURAL_PROMPT, aiEditSize } from "./model";

export type EditOutcome =
  | { kind: "ok"; bytes: Uint8Array; mime: string }
  /** Falha clara e transitória (429/5xx antes de qualquer processamento). */
  | { kind: "retry"; message: string; retryAfterSec?: number }
  /** Falha definitiva (recusa, formato, créditos, acesso). */
  | { kind: "fail"; message: string; pause?: boolean }
  /** Não sabemos se o provedor processou (transporte/corpo interrompido). Não reenviar sozinho. */
  | { kind: "uncertain"; message: string };

export interface ImageEditProvider {
  id: string;
  model: string;
  configured(): boolean;
  edit(input: { bytes: Uint8Array; mime: string; width: number; height: number }): Promise<EditOutcome>;
}

const GATEWAY = "https://ai.gateway.lovable.dev";
const MODEL = "openai/gpt-image-2.5-sunburst";

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function safeMessage(text: string, fallback: string) {
  try {
    const j = JSON.parse(text);
    const m = j?.error?.message ?? j?.message;
    if (typeof m === "string" && m.length) return m.slice(0, 240);
  } catch { /* corpo não-JSON */ }
  return fallback;
}

export const lovableGatewayProvider: ImageEditProvider = {
  id: "lovable-ai/openai",
  model: MODEL,
  configured: () => Boolean(process.env["LOVABLE_API_KEY"]),
  async edit({ bytes, mime, width, height }) {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { kind: "fail", message: "IA não configurada: falta a chave de IA do projeto.", pause: true };
    const { size } = aiEditSize(width, height);
    const form = new FormData();
    form.set("model", MODEL);
    form.set("prompt", REALCE_NATURAL_PROMPT);
    form.set("size", size);
    form.set("quality", "high");
    form.set("output_format", "jpeg");
    form.set("stream", "true");
    form.set("image", new File([bytes], "foto.jpg", { type: mime }));
    let res: Response;
    try {
      res = await fetch(`${GATEWAY}/v1/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "X-Lovable-AIG-SDK": "fetch" },
        body: form,
      });
    } catch {
      return { kind: "uncertain", message: "A conexão com a IA caiu durante o envio." };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429 || res.status >= 500) {
        const ra = Number(res.headers.get("retry-after"));
        return { kind: "retry", message: "Serviço de IA ocupado no momento.", retryAfterSec: Number.isFinite(ra) && ra > 0 ? ra : undefined };
      }
      if (res.status === 402) return { kind: "fail", message: safeMessage(text, "Créditos de IA insuficientes."), pause: true };
      if (res.status === 403) return { kind: "fail", message: safeMessage(text, "Acesso à IA bloqueado para esta conta."), pause: true };
      return { kind: "fail", message: safeMessage(text, "A IA recusou esta foto.") };
    }
    if (!res.body) return { kind: "uncertain", message: "Resposta vazia da IA." };
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let final: string | null = null;
    let errorMsg: string | null = null;
    let events = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const data = frame.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
          if (!data || data === "[DONE]") continue;
          try {
            const ev = JSON.parse(data);
            events++;
            if (ev.type === "error" || ev.error) errorMsg = String(ev.error?.message ?? ev.message ?? "Erro da IA").slice(0, 240);
            else if (typeof ev.type === "string" && ev.type.endsWith(".completed") && ev.b64_json) final = ev.b64_json;
          } catch { /* quadro incompleto */ }
        }
      }
    } catch {
      return { kind: "uncertain", message: "A resposta da IA foi interrompida." };
    }
    if (final) return { kind: "ok", bytes: b64ToBytes(final), mime: "image/jpeg" };
    if (errorMsg) return { kind: "fail", message: errorMsg };
    return { kind: "uncertain", message: events ? "A IA não entregou a imagem final." : "A IA encerrou sem resposta." };
  },
};

export const activeProvider = lovableGatewayProvider;
