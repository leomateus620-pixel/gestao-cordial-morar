import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bath, Bed, Car, Heart, MapPin, Maximize2, MessageCircle } from "lucide-react";
import { CardGallery } from "@/components/imoveis/CardGallery";
import { PhotoLightbox } from "@/components/imoveis/PhotoLightbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getSiteBrand } from "@/lib/cordial-site/brand";
import { brl } from "@/lib/format";
import { buildClientWhatsappText, whatsappUrl } from "@/lib/selecoes/rules";
import {
  getPublicSelection,
  type PublicSelection,
  type PublicSelectionItem,
} from "@/lib/selecoes/selecoes.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/s/$token")({
  loader: ({ params }) => getPublicSelection({ data: { token: params.token } }),
  staleTime: 0,
  gcTime: 0,
  head: () => ({
    meta: [
      { title: "Seleção de imóveis" },
      { name: "description", content: "Opções de imóveis separadas pelo seu corretor." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Seleção de imóveis" },
      { property: "og:description", content: "Opções de imóveis separadas pelo seu corretor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  errorComponent: () => (
    <Shell agency="cordial">
      <Notice title="Não foi possível abrir a seleção" text="Verifique sua conexão e tente de novo em instantes." retry />
    </Shell>
  ),
  component: PublicSelectionPage,
});

type Available = Extract<PublicSelectionItem, { available: true }>;

function Shell({ agency, children }: { agency: "cordial" | "morar"; children: React.ReactNode }) {
  const brand = getSiteBrand(agency);
  return (
    <div className="min-h-dvh bg-[linear-gradient(180deg,#f6f2ec,#eef3f4)] pb-[calc(env(safe-area-inset-bottom)+6rem)]">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-4">
          <img src={brand.logo} alt={brand.name} className="h-8 w-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pt-5">{children}</main>
    </div>
  );
}

function Notice({ title, text, retry }: { title: string; text: string; retry?: boolean }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-sm">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-foreground/60">{text}</p>
      {retry ? (
        <button type="button" onClick={() => window.location.reload()} className="mt-4 h-10 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}

function priceText(item: Available) {
  if (item.price == null) return "Valor sob consulta";
  return item.operation === "aluguel" ? `${brl(item.price)}/mês` : brl(item.price);
}

function Specs({ item }: { item: Available }) {
  const list = [
    item.bedrooms != null ? { icon: Bed, t: `${item.bedrooms} ${item.bedrooms === 1 ? "dormitório" : "dormitórios"}` } : null,
    item.bathrooms != null ? { icon: Bath, t: `${item.bathrooms} ${item.bathrooms === 1 ? "banheiro" : "banheiros"}` } : null,
    item.parking != null ? { icon: Car, t: `${item.parking} ${item.parking === 1 ? "vaga" : "vagas"}` } : null,
    item.area != null ? { icon: Maximize2, t: `${item.area.toLocaleString("pt-BR")} m²` } : null,
  ].filter(Boolean) as Array<{ icon: typeof Bed; t: string }>;
  if (!list.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-foreground/65">
      {list.map((s) => (
        <li key={s.t} className="inline-flex items-center gap-1">
          <s.icon className="size-3.5 text-foreground/40" /> {s.t}
        </li>
      ))}
    </ul>
  );
}

function PublicSelectionPage() {
  const data = Route.useLoaderData() as PublicSelection;
  const { token } = Route.useParams();

  if (data.state === "invalid")
    return (
      <Shell agency="cordial">
        <Notice title="Link não encontrado" text="Confira se o endereço foi copiado por completo ou peça um novo link ao seu corretor." />
      </Shell>
    );
  if (data.state !== "ok")
    return (
      <Shell agency={data.agency}>
        <Notice
          title={data.state === "expired" ? "Este link expirou" : "Esta seleção foi encerrada"}
          text="Fale com seu corretor para receber uma seleção atualizada."
        />
      </Shell>
    );

  return <SelectionView data={data} token={token} />;
}

function SelectionView({ data, token }: { data: Extract<PublicSelection, { state: "ok" }>; token: string }) {
  const favKey = `cordial:selecao-publica:${token}`;
  const [favs, setFavs] = useState<string[]>([]);
  const [detail, setDetail] = useState<Available | null>(null);
  const [lightbox, setLightbox] = useState<{ item: Available; index: number } | null>(null);
  const [link, setLink] = useState("");

  useEffect(() => {
    setLink(window.location.href.split("#")[0]!);
    try {
      const raw = window.localStorage.getItem(favKey);
      if (raw) setFavs(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [favKey]);

  const available = data.items.filter((i): i is Available => i.available);
  const unavailableCount = data.items.length - available.length;
  const validFavs = favs.filter((id) => available.some((a) => a.id === id));

  function toggleFav(id: string) {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    try {
      window.localStorage.setItem(favKey, JSON.stringify(next));
    } catch {
      // Preferência vale só nesta visita.
    }
  }

  const waHref = useMemo(() => {
    const refs = available
      .filter((a) => validFavs.includes(a.id))
      .map((a) => a.reference ?? "")
      .filter(Boolean);
    return whatsappUrl(data.whatsapp, buildClientWhatsappText({ title: data.title, link, favoriteRefs: refs }));
  }, [available, validFavs, data.whatsapp, data.title, link]);

  return (
    <Shell agency={data.agency}>
      <section className="mb-5 space-y-2">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight sm:text-[28px]">{data.title}</h1>
        {data.message ? <p className="whitespace-pre-line text-[14px] text-foreground/70">{data.message}</p> : null}
        <p className="text-[12.5px] text-foreground/55">
          {data.broker ? `Atendimento: ${data.broker} · ` : ""}
          {available.length} {available.length === 1 ? "opção disponível" : "opções disponíveis"}
        </p>
      </section>

      {!available.length ? (
        <Notice title="As opções desta seleção não estão mais disponíveis" text="Fale com seu corretor para ver novas alternativas." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((item) => {
            const fav = favs.includes(item.id);
            const place = [item.district, item.city].filter(Boolean).join(" · ");
            return (
              <article key={item.id} className="group overflow-hidden rounded-[22px] border border-white/70 bg-white/80 shadow-[0_12px_32px_-18px_rgba(23,27,33,0.28)]">
                <div className="relative aspect-[4/3]">
                  <CardGallery
                    photos={item.photos}
                    alt={`${item.type ?? "Imóvel"} ${item.reference ?? ""}`}
                    onTap={() => setDetail(item)}
                    onExpand={(index) => setLightbox({ item, index })}
                  />
                  <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-[rgba(30,100,125,0.88)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                    {item.operation === "aluguel" ? "Aluguel" : "Venda"}
                  </span>
                </div>
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-[15px] font-semibold">{item.type ?? "Imóvel"}</h2>
                    {item.reference ? <span className="font-mono text-[11px] text-foreground/50">Ref. {item.reference}</span> : null}
                  </div>
                  <p className="text-[19px] font-bold text-primary">{priceText(item)}</p>
                  {place ? (
                    <p className="flex items-center gap-1 text-[12.5px] text-foreground/60">
                      <MapPin className="size-3.5" /> {place}
                    </p>
                  ) : null}
                  <Specs item={item} />
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      aria-pressed={fav}
                      onClick={() => toggleFav(item.id)}
                      className={cn(
                        "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border-2 text-[13px] font-semibold transition",
                        fav ? "border-rose-500 bg-rose-500 text-white" : "border-foreground/15 text-foreground/75",
                      )}
                    >
                      <Heart className="size-4" fill={fav ? "currentColor" : "none"} />
                      {fav ? "Gostei" : "Gostei deste imóvel"}
                    </button>
                    <button type="button" onClick={() => setDetail(item)} className="h-10 rounded-full px-3 text-[13px] font-semibold text-primary">
                      Detalhes
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {unavailableCount > 0 ? (
        <p className="mt-4 text-center text-[12px] text-foreground/50">
          {unavailableCount} {unavailableCount === 1 ? "opção não está mais disponível" : "opções não estão mais disponíveis"}.
        </p>
      ) : null}

      <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-30 mx-auto max-w-md">
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#1f8f4e] px-5 text-[14px] font-semibold text-white shadow-lg"
        >
          <MessageCircle className="size-5" />
          {validFavs.length
            ? `Conversar sobre os escolhidos (${validFavs.length})`
            : "Conversar sobre a seleção"}
        </a>
        <p className="mt-1 text-center text-[10.5px] text-foreground/50">
          Abrimos o WhatsApp para você revisar e enviar a mensagem.
        </p>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto p-0">
          {detail ? (
            <>
              <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg">
                <CardGallery photos={detail.photos} alt={detail.type ?? "Imóvel"} onExpand={(index) => setLightbox({ item: detail, index })} />
              </div>
              <div className="space-y-3 p-5">
                <DialogTitle className="text-lg">
                  {detail.type ?? "Imóvel"} {detail.reference ? <span className="font-mono text-sm text-foreground/50">Ref. {detail.reference}</span> : null}
                </DialogTitle>
                <DialogDescription className="sr-only">Detalhes do imóvel</DialogDescription>
                <p className="text-2xl font-bold text-primary">{priceText(detail)}</p>
                {detail.condo != null && detail.condo > 0 ? <p className="text-sm text-foreground/65">Condomínio: {brl(detail.condo)}</p> : null}
                {detail.iptu != null && detail.iptu > 0 ? <p className="text-sm text-foreground/65">IPTU: {brl(detail.iptu)}</p> : null}
                {[detail.district, detail.city].filter(Boolean).length ? (
                  <p className="flex items-center gap-1 text-sm text-foreground/65">
                    <MapPin className="size-4" /> {[detail.district, detail.city].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
                <Specs item={detail} />
                <button
                  type="button"
                  aria-pressed={favs.includes(detail.id)}
                  onClick={() => toggleFav(detail.id)}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border-2 border-foreground/15 px-4 text-[13px] font-semibold"
                >
                  <Heart className="size-4" fill={favs.includes(detail.id) ? "currentColor" : "none"} />
                  {favs.includes(detail.id) ? "Gostei" : "Gostei deste imóvel"}
                </button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <PhotoLightbox
        open={!!lightbox}
        onOpenChange={(o) => !o && setLightbox(null)}
        photos={lightbox?.item.photos ?? []}
        startIndex={lightbox?.index ?? 0}
        title={`${lightbox?.item.type ?? "Imóvel"} ${lightbox?.item.reference ?? ""}`.trim()}
      />
    </Shell>
  );
}
