import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth-mock";
import { checkCaption } from "@/lib/studio/caption-check";
import { STUDIO_FORMATS, type StudioFormatId } from "@/lib/studio/formats";
import { renderStudioImage } from "@/lib/studio/render-canvas";
import { currentTemplate } from "@/lib/studio/templates";
import type { StudioBrand } from "@/lib/studio/templates/types";
import {
  approveStudioProject,
  createStudioProject,
  generateStudioTexts,
  listStudioEligibleProperties,
  type StudioEligibleProperty,
  type StudioTextVariant,
} from "@/lib/studio/studio.functions";

export const Route = createFileRoute("/_app/assistente/estudio")({
  head: () => ({ meta: [{ title: "Estúdio de Conteúdo — Cordial Bot" }] }),
  component: Page,
});

type Step = "imovel" | "marca" | "formato" | "textos" | "previa" | "aprovado";

const BRANDS: { id: StudioBrand; label: string }[] = [
  { id: "cordial", label: "Cordial" },
  { id: "morar", label: "Morar" },
];

function Page() {
  const session = useSession();
  const listEligible = useServerFn(listStudioEligibleProperties);
  const createProject = useServerFn(createStudioProject);
  const genTexts = useServerFn(generateStudioTexts);
  const approveProject = useServerFn(approveStudioProject);

  const [step, setStep] = useState<Step>("imovel");
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState<StudioEligibleProperty[] | null>(null);
  const [property, setProperty] = useState<StudioEligibleProperty | null>(null);
  const [marca, setMarca] = useState<StudioBrand | null>(null);
  const [formato, setFormato] = useState<StudioFormatId | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [variantes, setVariantes] = useState<StudioTextVariant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [editedText, setEditedText] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const caption = useMemo(() => checkCaption(editedText), [editedText]);

  async function loadEligible() {
    setLoading(true);
    try {
      const rows = await listEligible();
      setProperties(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao listar imóveis.");
    } finally {
      setLoading(false);
    }
  }

  async function pickProperty(p: StudioEligibleProperty) {
    setProperty(p);
    setStep("marca");
  }

  function pickMarca(b: StudioBrand) {
    setMarca(b);
    setStep("formato");
  }

  async function pickFormato(f: StudioFormatId) {
    if (!property || !marca) return;
    setFormato(f);
    setLoading(true);
    try {
      const { id } = await createProject({ data: { propertyId: property.id, marca, formato: f } });
      setProjectId(id);
      setStep("textos");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar o projeto.");
    } finally {
      setLoading(false);
    }
  }

  async function gerarTextos() {
    if (!projectId || !session) return;
    setLoading(true);
    try {
      const { variantes: vs } = await genTexts({
        data: { projectId, corretorNome: session.nome },
      });
      setVariantes(vs);
      setSelectedVariant(0);
      setEditedText(`${vs[0]?.titulo ?? ""}\n\n${vs[0]?.texto ?? ""}\n\n${(vs[0]?.hashtags ?? []).map((h) => `#${h}`).join(" ")}\n\n${vs[0]?.cta ?? ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar textos.");
    } finally {
      setLoading(false);
    }
  }

  function escolherVariante(idx: number) {
    setSelectedVariant(idx);
    const v = variantes[idx];
    if (!v) return;
    setEditedText(`${v.titulo}\n\n${v.texto}\n\n${v.hashtags.map((h) => `#${h}`).join(" ")}\n\n${v.cta}`);
  }

  async function gerarPrevia() {
    if (!property?.coverUrl || !formato || !marca) return;
    setLoading(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("falha_ao_carregar_foto"));
        img.src = property.coverUrl as string;
      });
      imgRef.current = img;
      const spec = STUDIO_FORMATS[formato];
      const template = currentTemplate(marca);
      const blob = await renderStudioImage({
        photo: img,
        targetWidth: spec.width,
        targetHeight: spec.height,
        template,
        overlays: [
          { text: property.priceLabel ?? "", x: 48, y: spec.height - 140, sizePx: 48, color: "#fff" },
          { text: property.location, x: 48, y: spec.height - 80, sizePx: 36, color: "#fff" },
        ],
      });
      setPreviewBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      setStep("previa");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar a prévia.");
    } finally {
      setLoading(false);
    }
  }

  async function aprovar() {
    if (!projectId) return;
    if (!caption.ok) {
      toast.error("Corrija o texto antes de aprovar (ver reprovações abaixo).");
      return;
    }
    setLoading(true);
    try {
      const res = await approveProject({ data: { projectId } });
      if (!res?.ok) throw new Error(res?.error ?? "falha_ao_aprovar");
      setStep("aprovado");
      toast.success("Projeto aprovado. Baixe os arquivos — a publicação é manual.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao aprovar.");
    } finally {
      setLoading(false);
    }
  }

  function baixarImagem() {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `estudio-${formato ?? "imagem"}.png`;
    a.click();
  }

  function baixarLegenda() {
    const blob = new Blob([editedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "legenda.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Estúdio de Conteúdo</h1>
        <p className="text-sm text-muted-foreground">
          Só fotos públicas reais do imóvel, apenas recorte/zoom (sem geração de imagem) e nunca publica
          automaticamente — você revisa, aprova e baixa para postar manualmente.
        </p>
      </div>

      {step === "imovel" && (
        <Card>
          <CardHeader>
            <CardTitle>1. Escolha o imóvel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!properties && (
              <Button onClick={loadEligible} disabled={loading}>
                Carregar imóveis elegíveis
              </Button>
            )}
            {properties?.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum imóvel elegível no momento.</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {properties?.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProperty(p)}
                  className="rounded-lg border p-3 text-left hover:bg-accent"
                >
                  <div className="font-medium">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.reference}</div>
                  <div className="text-xs text-muted-foreground">{p.location}</div>
                  {p.priceLabel && <div className="text-sm font-semibold">{p.priceLabel}</div>}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {step === "marca" && (
        <Card>
          <CardHeader>
            <CardTitle>2. Escolha a marca</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            {BRANDS.map((b) => (
              <Button key={b.id} variant="outline" onClick={() => pickMarca(b.id)}>
                {b.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === "formato" && (
        <Card>
          <CardHeader>
            <CardTitle>3. Escolha o formato</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {Object.values(STUDIO_FORMATS).map((f) => (
              <Button key={f.id} variant="outline" disabled={loading} onClick={() => pickFormato(f.id)}>
                {f.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === "textos" && (
        <Card>
          <CardHeader>
            <CardTitle>4. Gerar textos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {variantes.length === 0 ? (
              <Button onClick={gerarTextos} disabled={loading}>
                Gerar variações de legenda
              </Button>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {variantes.map((v, idx) => (
                    <Button
                      key={v.tom}
                      size="sm"
                      variant={idx === selectedVariant ? "default" : "outline"}
                      onClick={() => escolherVariante(idx)}
                    >
                      {v.tom}
                    </Button>
                  ))}
                </div>
                <Textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={8}
                />
                {!caption.ok && (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                    {caption.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                )}
                <Button onClick={gerarPrevia} disabled={loading || !caption.ok}>
                  Continuar para a prévia
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {step === "previa" && (
        <Card>
          <CardHeader>
            <CardTitle>5. Prévia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {previewUrl && (
              <img src={previewUrl} alt="Prévia do conteúdo" className="max-h-[480px] rounded-lg border" />
            )}
            <Textarea value={editedText} onChange={(e) => setEditedText(e.target.value)} rows={6} />
            {!caption.ok && (
              <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
                {caption.issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={aprovar} disabled={loading || !caption.ok}>
                Aprovar
              </Button>
              <Button variant="outline" onClick={baixarImagem} disabled={!previewBlob}>
                Baixar PNG
              </Button>
              <Button variant="outline" onClick={baixarLegenda}>
                Baixar legenda (.txt)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "aprovado" && (
        <Card>
          <CardHeader>
            <CardTitle>Projeto aprovado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Baixe os arquivos e publique manualmente — o Estúdio nunca posta sozinho.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={baixarImagem} disabled={!previewBlob}>
                Baixar PNG
              </Button>
              <Button variant="outline" onClick={baixarLegenda}>
                Baixar legenda (.txt)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
