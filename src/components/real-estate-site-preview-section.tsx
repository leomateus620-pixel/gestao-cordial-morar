import { ExternalLink, Globe2, Link2, MonitorSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const realEstateSites = [
  {
    id: "cordial",
    name: "Cordial Imóveis",
    url: "https://www.cordialimoveis.com/",
    description: "Acesse o site oficial da Cordial para consultar imóveis atualizados.",
  },
  {
    id: "morar",
    name: "Morar Imóveis",
    url: "https://www.imobiliariamorarimoveis.com.br/",
    description: "Acesse o site oficial da Morar para consultar imóveis atualizados.",
  },
] as const;

type RealEstateSite = (typeof realEstateSites)[number];

export function RealEstateSitePreviewSection() {
  const [selectedSite, setSelectedSite] = useState<RealEstateSite | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);

  useEffect(() => {
    if (!selectedSite) return;

    setPreviewLoaded(false);
    setPreviewUnavailable(false);

    const fallbackTimer = window.setTimeout(() => {
      setPreviewUnavailable(true);
    }, 6500);

    return () => window.clearTimeout(fallbackTimer);
  }, [selectedSite]);

  const domain = selectedSite ? new URL(selectedSite.url).hostname.replace("www.", "") : "";

  return (
    <section className="mb-5">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/75">
            Sites oficiais
          </p>
          <h2 className="text-xl font-semibold tracking-tight">Sites das Imobiliárias</h2>
        </div>
        <p className="max-w-xl text-sm text-foreground/55">
          Consulte os imóveis sempre nas fontes oficiais, sem duplicar cadastros dentro do sistema.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {realEstateSites.map((site) => (
          <article
            key={site.id}
            className="group premium-card relative overflow-hidden rounded-3xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
          >
            <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-primary/10 blur-3xl transition-transform duration-500 group-hover:scale-125" />
            <div className="relative flex items-start gap-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/50 bg-white/65 text-primary shadow-sm backdrop-blur">
                <Globe2 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{site.name}</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-foreground/5 px-2 py-1 text-[10px] font-medium text-foreground/55">
                    <Link2 className="size-3" />
                    {new URL(site.url).hostname.replace("www.", "")}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-foreground/60">
                  {site.description}
                </p>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button asChild className="rounded-xl">
                    <a href={site.url} target="_blank" rel="noopener noreferrer">
                      Acessar site
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl bg-white/55"
                    onClick={() => setSelectedSite(site)}
                  >
                    <MonitorSmartphone className="size-4" />
                    Pré-visualizar
                  </Button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Dialog open={Boolean(selectedSite)} onOpenChange={(open) => !open && setSelectedSite(null)}>
        <DialogContent className="max-h-[92vh] w-[min(1120px,calc(100vw-1.5rem))] max-w-none overflow-hidden rounded-3xl border-white/40 bg-background/95 p-0 shadow-2xl backdrop-blur-xl">
          {selectedSite && (
            <>
              <DialogHeader className="border-b border-border/60 px-5 py-4 pr-12">
                <DialogTitle className="flex items-center gap-2">
                  <Globe2 className="size-5 text-primary" />
                  Pré-visualização — {selectedSite.name}
                </DialogTitle>
                <DialogDescription>
                  Se a prévia não carregar por proteção do site, abra em uma nova aba.
                </DialogDescription>
              </DialogHeader>

              <div className="p-3 sm:p-5">
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-white shadow-sm">
                  <div className="flex items-center gap-2 border-b border-border/70 bg-muted/60 px-3 py-2">
                    <span className="size-2.5 rounded-full bg-red-400" />
                    <span className="size-2.5 rounded-full bg-amber-400" />
                    <span className="size-2.5 rounded-full bg-emerald-400" />
                    <div className="ml-2 flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-foreground/55 shadow-inner">
                      <Globe2 className="size-3.5 shrink-0" />
                      <span className="truncate">{domain}</span>
                    </div>
                  </div>

                  <div className="relative aspect-[16/11] min-h-[420px] bg-muted/35 max-sm:aspect-[9/13] max-sm:min-h-[520px]">
                    {!previewLoaded && (
                      <div className="absolute inset-0 z-10 space-y-4 bg-background/95 p-5">
                        <Skeleton className="h-8 w-2/3" />
                        <Skeleton className="h-32 w-full rounded-2xl" />
                        <div className="grid gap-3 sm:grid-cols-3">
                          <Skeleton className="h-20 rounded-2xl" />
                          <Skeleton className="h-20 rounded-2xl" />
                          <Skeleton className="h-20 rounded-2xl" />
                        </div>
                        {previewUnavailable && (
                          <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-border bg-background/95 p-4 text-center shadow-lg">
                            <p className="text-sm font-semibold">
                              A pré-visualização deste site não está disponível aqui.
                            </p>
                            <Button asChild className="mt-3 rounded-xl">
                              <a href={selectedSite.url} target="_blank" rel="noopener noreferrer">
                                Abrir site em nova aba
                                <ExternalLink className="size-4" />
                              </a>
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    <iframe
                      key={selectedSite.id}
                      title={`Pré-visualização do site ${selectedSite.name}`}
                      src={selectedSite.url}
                      loading="lazy"
                      className="size-full border-0"
                      onLoad={() => setPreviewLoaded(true)}
                      onError={() => setPreviewUnavailable(true)}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-border/60 bg-white/55 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">
                      A pré-visualização deste site não está disponível aqui?
                    </p>
                    <p className="text-xs text-foreground/50">
                      A consulta de imóveis permanece nos sites oficiais das imobiliárias.
                    </p>
                  </div>
                  <Button asChild variant="outline" className="rounded-xl bg-white/70">
                    <a href={selectedSite.url} target="_blank" rel="noopener noreferrer">
                      Abrir site em nova aba
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
