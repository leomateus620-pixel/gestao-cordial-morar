import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { SiteBanner, SiteSettings } from "@/lib/cordial-site/contract";
import { bannerStatus } from "@/lib/cordial-site/banners";
import { autoPropertySeo } from "@/lib/cordial-site/property-slug";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import type { PropertyOption } from "./FeaturedEditor";

const input = "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm";
type Props = {
  brand: SiteBrand;
  values: SiteSettings;
  setValues: Dispatch<SetStateAction<SiteSettings>>;
  options: PropertyOption[];
};
const box = "space-y-3 rounded-md border p-4";
const legend = "px-1 text-sm font-semibold";
const small = "text-xs text-muted-foreground";
const btn = "rounded-md border px-3 py-1.5 text-sm disabled:opacity-50";
const label = (o: PropertyOption) =>
  `REF. ${o.public_reference ?? "—"} · ${o.tipo ?? "Imóvel"} · ${o.bairro ?? ""} · ${o.cidade ?? ""}`;

export function FeaturedMixEditor({ values, setValues }: Props) {
  const mix = values.featuredMix;
  const over = mix.venda + mix.aluguel > 5;
  return (
    <fieldset className={box}>
      <legend className={legend}>Destaques por finalidade</legend>
      <p className={small}>
        A página inicial mostra cinco destaques nas duas marcas. Reserve quantos devem ser de venda e
        de aluguel; as vagas restantes ficam com os mais recentes com foto. Zero = sem preferência.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["venda", "aluguel"] as const).map((op) => (
          <label key={op} className="text-sm">
            {op === "venda" ? "Vagas de venda" : "Vagas de aluguel"}
            <input
              type="number"
              min={0}
              max={5}
              className={input}
              value={mix[op]}
              onChange={(e) =>
                setValues((s) => ({
                  ...s,
                  featuredMix: { ...s.featuredMix, [op]: Math.max(0, Math.min(5, Number(e.target.value) || 0)) },
                }))
              }
            />
          </label>
        ))}
      </div>
      {over && (
        <p role="alert" className="text-sm text-destructive">
          A soma não pode passar de cinco.
        </p>
      )}
    </fieldset>
  );
}

const emptyBanner = (): SiteBanner => ({
  id: crypto.randomUUID(),
  imageUrl: "",
  mobileImageUrl: "",
  title: "",
  caption: "",
  href: "",
  alt: "",
  startsAt: null,
  endsAt: null,
  active: true,
});
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);
const statusText = { ativo: "No ar", agendado: "Agendado", encerrado: "Encerrado", pausado: "Pausado" };

export function BannerEditor({ values, setValues }: Omit<Props, "brand" | "options">) {
  const list = values.banners;
  const update = (i: number, patch: Partial<SiteBanner>) =>
    setValues((s) => ({ ...s, banners: s.banners.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));
  const move = (i: number, d: number) =>
    setValues((s) => {
      const b = [...s.banners];
      [b[i], b[i + d]] = [b[i + d], b[i]];
      return { ...s, banners: b };
    });
  return (
    <fieldset className={box}>
      <legend className={legend}>Banners e campanhas</legend>
      <p className={small}>
        Aparecem abaixo da busca, na ordem desta lista, só dentro do período. Imagem em endereço https
        (ideal 1600×500; no celular, 1200×900 opcional). Sem banner no ar, a página fica como hoje.
      </p>
      {list.map((b, i) => (
        <div key={b.id} className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="mr-auto text-sm">
              {i + 1}. {b.title || "Banner sem título"} · {statusText[bannerStatus(b)]}
            </strong>
            <button type="button" className={btn} disabled={i === 0} onClick={() => move(i, -1)}>
              Subir
            </button>
            <button type="button" className={btn} disabled={i === list.length - 1} onClick={() => move(i, 1)}>
              Descer
            </button>
            <button type="button" className={btn} onClick={() => update(i, { active: !b.active })}>
              {b.active ? "Pausar" : "Ativar"}
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => setValues((s) => ({ ...s, banners: s.banners.filter((x) => x.id !== b.id) }))}
            >
              Remover
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {(
              [
                ["imageUrl", "Imagem (https)"],
                ["mobileImageUrl", "Imagem para celular (opcional)"],
                ["title", "Título"],
                ["caption", "Legenda"],
                ["href", "Link (ex.: /buscar?finalidade=venda ou https://…)"],
                ["alt", "Descrição da imagem (acessibilidade)"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="text-sm">
                {l}
                <input className={input} value={b[k]} onChange={(e) => update(i, { [k]: e.target.value })} />
              </label>
            ))}
            <label className="text-sm">
              Início
              <input type="datetime-local" className={input} value={toLocal(b.startsAt)} onChange={(e) => update(i, { startsAt: fromLocal(e.target.value) })} />
            </label>
            <label className="text-sm">
              Fim
              <input type="datetime-local" className={input} value={toLocal(b.endsAt)} onChange={(e) => update(i, { endsAt: fromLocal(e.target.value) })} />
            </label>
          </div>
          {b.imageUrl.startsWith("https://") && (
            <img src={b.imageUrl} alt="" className="aspect-[16/5] w-full rounded object-cover" loading="lazy" />
          )}
        </div>
      ))}
      <button
        type="button"
        className={btn}
        disabled={list.length >= 8}
        onClick={() => setValues((s) => ({ ...s, banners: [...s.banners, emptyBanner()] }))}
      >
        Adicionar banner
      </button>
    </fieldset>
  );
}

export function SearchSettingsEditor({ values, setValues, options }: Props) {
  const types = useMemo(
    () => [...new Set(options.map((o) => o.tipo).filter((t): t is string => !!t))].sort(),
    [options],
  );
  const toggle = (op: "venda" | "aluguel", t: string) =>
    setValues((s) => {
      const cur = s.searchTypes[op];
      return {
        ...s,
        searchTypes: { ...s.searchTypes, [op]: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] },
      };
    });
  const quick = values.quickSearches;
  const setQuick = (q: SiteSettings["quickSearches"]) => setValues((s) => ({ ...s, quickSearches: q }));
  return (
    <div className="space-y-6">
      <fieldset className={box}>
        <legend className={legend}>Ordenação padrão</legend>
        <label className="text-sm">
          Ordem dos resultados ao buscar pela página inicial
          <select
            className={input}
            value={values.searchDefaultOrder}
            onChange={(e) =>
              setValues((s) => ({ ...s, searchDefaultOrder: e.target.value as SiteSettings["searchDefaultOrder"] }))
            }
          >
            <option value="recentes">Publicados recentemente (padrão)</option>
            <option value="preco_asc">Menor preço</option>
            <option value="preco_desc">Maior preço</option>
            <option value="area_desc">Maior área</option>
          </select>
        </label>
        <p className={small}>O visitante continua podendo trocar a ordem nos resultados.</p>
      </fieldset>
      <fieldset className={box}>
        <legend className={legend}>Tipos de imóvel por finalidade</legend>
        <p className={small}>Nenhum marcado = todos os tipos com imóveis publicados.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {(["venda", "aluguel"] as const).map((op) => (
            <div key={op}>
              <p className="mb-1 text-sm font-medium">{op === "venda" ? "Comprar" : "Alugar"}</p>
              <div className="flex flex-wrap gap-2">
                {types.map((t) => (
                  <label key={t} className="flex items-center gap-1 rounded border px-2 py-1 text-xs">
                    <input type="checkbox" checked={values.searchTypes[op].includes(t)} onChange={() => toggle(op, t)} />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <fieldset className={box}>
        <legend className={legend}>Atalhos de busca rápida</legend>
        <p className={small}>Até oito botões abaixo da busca da página inicial.</p>
        {quick.map((q, i) => (
          <div key={i} className="grid gap-2 rounded border p-2 md:grid-cols-6">
            <input className={input + " md:col-span-2"} placeholder="Nome (ex.: Casas à venda)" value={q.label} onChange={(e) => setQuick(quick.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <select className={input} value={q.finalidade} onChange={(e) => setQuick(quick.map((x, j) => (j === i ? { ...x, finalidade: e.target.value as "venda" | "aluguel" } : x)))}>
              <option value="venda">Comprar</option>
              <option value="aluguel">Alugar</option>
            </select>
            <select className={input} value={q.tipo} onChange={(e) => setQuick(quick.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}>
              <option value="">Todos os tipos</option>
              {types.map((t) => <option key={t}>{t}</option>)}
            </select>
            <input className={input} placeholder="Cidade" value={q.cidade} onChange={(e) => setQuick(quick.map((x, j) => (j === i ? { ...x, cidade: e.target.value } : x)))} />
            <button type="button" className={btn + " mt-1"} onClick={() => setQuick(quick.filter((_, j) => j !== i))}>
              Remover
            </button>
          </div>
        ))}
        <button type="button" className={btn} disabled={quick.length >= 8} onClick={() => setQuick([...quick, { label: "", finalidade: "venda", tipo: "", cidade: "", bairro: "" }])}>
          Adicionar atalho
        </button>
      </fieldset>
    </div>
  );
}

export function PropertySeoEditor({ values, setValues, options }: Props) {
  const [ref, setRef] = useState("");
  const found = ref.trim()
    ? options.filter((o) => (o.public_reference ?? "").toLowerCase().includes(ref.trim().toLowerCase())).slice(0, 8)
    : [];
  const list = values.seoOverrides;
  const put = (publicId: string, patch: { title?: string; description?: string }) =>
    setValues((s) => {
      const exists = s.seoOverrides.some((o) => o.publicId === publicId);
      const next = exists
        ? s.seoOverrides.map((o) => (o.publicId === publicId ? { ...o, ...patch } : o))
        : [...s.seoOverrides, { publicId, title: "", description: "", ...patch }];
      return { ...s, seoOverrides: next };
    });
  return (
    <fieldset className={box}>
      <legend className={legend}>Título e descrição de cada imóvel</legend>
      <p className={small}>
        Todos os imóveis já recebem título e descrição automáticos (tipo, finalidade, quartos, bairro,
        cidade, área, valor e referência) e um endereço amigável. Personalize só quando quiser outro
        texto; campo vazio volta ao automático.
      </p>
      <label className="text-sm">
        Buscar imóvel pela referência
        <input className={input} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ex.: 1398" />
      </label>
      {found.map((o) => (
        <button key={o.public_id} type="button" className={btn + " mr-2"} onClick={() => { put(o.public_id, {}); setRef(""); }} disabled={list.some((x) => x.publicId === o.public_id)}>
          Personalizar {label(o)}
        </button>
      ))}
      {list.map((o) => {
        const opt = options.find((x) => x.public_id === o.publicId);
        const auto = autoPropertySeo({ id: o.publicId, reference: opt?.public_reference, type: opt?.tipo, district: opt?.bairro, city: opt?.cidade });
        return (
          <div key={o.publicId} className="space-y-2 rounded border p-3">
            <div className="flex items-center gap-2">
              <strong className="mr-auto text-sm">{opt ? label(opt) : "Imóvel fora do site"}</strong>
              <button type="button" className={btn} onClick={() => setValues((s) => ({ ...s, seoOverrides: s.seoOverrides.filter((x) => x.publicId !== o.publicId) }))}>
                Voltar ao automático
              </button>
            </div>
            <label className="block text-sm">
              Título ({o.title.length}/70)
              <input className={input} maxLength={70} placeholder={auto.title} value={o.title} onChange={(e) => put(o.publicId, { title: e.target.value })} />
            </label>
            <label className="block text-sm">
              Descrição ({o.description.length}/160)
              <textarea className={input} rows={2} maxLength={160} placeholder={auto.description} value={o.description} onChange={(e) => put(o.publicId, { description: e.target.value })} />
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
