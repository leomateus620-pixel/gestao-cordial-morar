/**
 * Server functions do Estúdio de Conteúdo. Só lê/escreve campos públicos do
 * imóvel (nunca dados de proprietário/cliente) e nunca publica automaticamente.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { checkCaption } from "./caption-check";
import { displayLocation, displayPrice } from "./display-rules";

const BUCKET = "studio-assets";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type StudioEligibleProperty = {
  id: string;
  title: string;
  reference: string;
  operation: string | null;
  priceLabel: string | null;
  location: string;
  coverUrl: string | null;
};

/** Lista imóveis elegíveis (mesma regra pública) para virar conteúdo. */
export const listStudioEligibleProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudioEligibleProperty[]> => {
    const supabase = context.supabase as any;
    const { data: props, error } = await supabase
      .from("properties")
      .select("id, tipo, codigo, codigo_cordial, codigo_morar, operacao, valor, valor_modo, bairro, cidade")
      .limit(200);
    if (error) throw new Error(error.message);
    const ids = (props ?? []).map((p: any) => p.id);
    if (!ids.length) return [];
    const { data: checks, error: e2 } = await supabase.rpc("shared_selection_check", { p_ids: ids });
    if (e2) throw new Error(e2.message);
    const eligible = new Map((checks ?? []).map((c: any) => [c.property_id, !!c.eligible]));
    const { data: imgs } = await supabase
      .from("property_images")
      .select("property_id, storage_path, position")
      .in("property_id", ids)
      .eq("position", 0);
    const coverPath = new Map<string, string>((imgs ?? []).map((i: any) => [i.property_id, i.storage_path as string]));
    const unique = Array.from(new Set(coverPath.values()));
    const signedMap = new Map<string, string>();
    if (unique.length) {
      const { data: signed } = await supabase.storage.from("property-images").createSignedUrls(unique, 3600);
      for (const s of (signed ?? []) as Array<{ path?: string | null; signedUrl: string }>) {
        if (s.path && s.signedUrl) signedMap.set(s.path, s.signedUrl);
      }
    }
    return (props ?? [])
      .filter((p: any) => eligible.get(p.id))
      .map((p: any) => {
        const path = coverPath.get(p.id);
        return {
          id: p.id,
          title: p.tipo ?? "Imóvel",
          reference: [p.codigo_cordial, p.codigo_morar].filter(Boolean).join(" / ") || p.codigo || "",
          operation: p.operacao,
          priceLabel: displayPrice({ valor: p.valor, valor_modo: p.valor_modo, bairro: p.bairro, cidade: p.cidade }),
          location: displayLocation({ valor: p.valor, valor_modo: p.valor_modo, bairro: p.bairro, cidade: p.cidade }),
          coverUrl: path ? (signedMap.get(path) ?? null) : null,
        };
      });
  });

const createSchema = z.object({
  propertyId: z.string().uuid(),
  marca: z.enum(["cordial", "morar"]),
  formato: z.enum(["story", "feed_quadrado", "feed_retrato", "carrossel", "video_vertical"]),
});

export const createStudioProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const uid = context.userId as string;
    const { data: checks, error: e1 } = await supabase.rpc("shared_selection_check", { p_ids: [data.propertyId] });
    if (e1) throw new Error(e1.message);
    if (!(checks ?? []).some((c: any) => c.property_id === data.propertyId && c.eligible)) {
      throw new Error("imovel_nao_elegivel");
    }
    const { data: row, error } = await supabase
      .from("studio_projects")
      .insert({ owner_id: uid, property_id: data.propertyId, marca: data.marca, formato: data.formato, status: "rascunho" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

const genTextSchema = z.object({
  projectId: z.string().uuid(),
  corretorNome: z.string().max(80),
});

export type StudioTextVariant = { tom: "acolhedor" | "direto" | "institucional"; titulo: string; texto: string; hashtags: string[]; cta: string };

/** Gera 3 tons + variações de público usando só campos públicos do imóvel. */
export const generateStudioTexts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => genTextSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: project, error } = await supabase
      .from("studio_projects")
      .select("id, owner_id, property_id")
      .eq("id", data.projectId)
      .single();
    if (error || !project) throw new Error("projeto_nao_encontrado");
    const { data: props } = await supabase
      .from("properties")
      .select("tipo, operacao, valor, valor_modo, bairro, cidade, dormitorios, vagas")
      .eq("id", project.property_id)
      .single();
    if (!props) throw new Error("imovel_nao_encontrado");
    const location = displayLocation(props);
    const price = displayPrice(props);
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("gateway_nao_configurado");

    const publicFacts = {
      tipo: props.tipo,
      operacao: props.operacao,
      preco: price,
      local: location,
      dormitorios: props.dormitorios,
      vagas: props.vagas,
    };
    const prompt = `Gere 3 variações curtas de legenda para rede social sobre um imóvel, em tons "acolhedor", "direto" e "institucional". Use só estes dados públicos (nunca invente endereço, proprietário ou código): ${JSON.stringify(
      publicFacts,
    )}. Para cada tom gere: titulo curto, texto (até 280 caracteres), 3 hashtags locais (sem acento, minúsculas), e finalize com a chamada: "Fale com ${data.corretorNome}". Responda só em JSON: {"variantes":[{"tom":"acolhedor","titulo":"","texto":"","hashtags":["",""]}]}.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        stream: true,
        messages: [
          { role: "system", content: "Você escreve legendas curtas para imóveis. Nunca inclua endereço exato, CPF, telefone, e-mail ou promessas de retorno/valorização." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok || !response.body) throw new Error("gateway_indisponivel");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === "[DONE]") continue;
        try {
          const evt = JSON.parse(raw);
          const delta = evt?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") text += delta;
        } catch {}
      }
    }
    let parsed: { variantes: StudioTextVariant[] };
    try {
      const jsonStart = text.indexOf("{");
      parsed = JSON.parse(text.slice(jsonStart));
    } catch {
      throw new Error("resposta_invalida");
    }
    const variantes = (parsed.variantes ?? []).map((v) => ({
      tom: v.tom,
      titulo: String(v.titulo ?? "").slice(0, 120),
      texto: String(v.texto ?? "").slice(0, 280),
      hashtags: Array.isArray(v.hashtags) ? v.hashtags.slice(0, 6).map(String) : [],
      cta: `Fale com ${data.corretorNome}`,
    }));
    for (const v of variantes) {
      const check = checkCaption(`${v.titulo} ${v.texto} ${v.hashtags.join(" ")}`);
      if (!check.ok) throw new Error(`texto_reprovado:${check.issues.join(",")}`);
    }
    await supabase.from("studio_projects").update({ textos: { variantes } }).eq("id", project.id);
    return { variantes };
  });

const approveSchema = z.object({ projectId: z.string().uuid() });

export const approveStudioProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => approveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await (context.supabase as any).rpc("studio_project_approve", {
      p_project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    return res;
  });

const downloadSchema = z.object({ assetId: z.string().uuid() });

/** URL assinada curta para baixar um asset já gerado (nunca publica sozinho). */
export const getStudioAssetDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => downloadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { data: asset, error } = await supabase
      .from("studio_assets")
      .select("storage_path")
      .eq("id", data.assetId)
      .single();
    if (error || !asset) throw new Error("asset_nao_encontrado");
    const { data: signed, error: e2 } = await supabase.storage.from(BUCKET).createSignedUrl(asset.storage_path, 600);
    if (e2) throw new Error(e2.message);
    return { url: signed.signedUrl as string };
  });
