import type { Dispatch, SetStateAction } from "react";
import type { SiteSettings } from "@/lib/cordial-site/contract";
import { verificationCode } from "@/lib/cordial-site/contract";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import { SITE_PUBLIC_HOSTS } from "@/lib/cordial-site/domains";
import { privacyTemplate, privacyIssues } from "@/lib/cordial-site/privacy-template";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeaturedEditor, type PropertyOption } from "./FeaturedEditor";
import {
  BannerEditor,
  FeaturedMixEditor,
  PropertySeoEditor,
  SearchSettingsEditor,
} from "./SiteContentEditors";
import { RedirectManager } from "./RedirectManager";

const input = "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm";

type Props = {
  brand: SiteBrand;
  values: SiteSettings;
  setValues: Dispatch<SetStateAction<SiteSettings>>;
};

/** Central "Site e Google": tudo o que o administrador ajusta nos sites, separado por marca. */
export function SiteGoogleSettings(props: Props & { options: PropertyOption[] }) {
  return (
    <section className="rounded-xl border bg-card p-4 md:col-span-2" aria-label="Site e Google">
      <h2 className="mb-1 text-base font-semibold">Site e Google</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Alterações das abas abaixo entram no ar ao salvar as configurações. Redirecionamentos são
        salvos na própria aba.
      </p>
      <Tabs defaultValue="identidade">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="identidade">Identidade e Google</TabsTrigger>
          <TabsTrigger value="inicio">Página inicial</TabsTrigger>
          <TabsTrigger value="busca">Busca</TabsTrigger>
          <TabsTrigger value="imoveis">SEO dos imóveis</TabsTrigger>
          <TabsTrigger value="redirecionamentos">Redirecionamentos</TabsTrigger>
        </TabsList>
        <TabsContent value="identidade" className="pt-4">
          <IdentitySeoSection {...props} />
        </TabsContent>
        <TabsContent value="inicio" className="space-y-6 pt-4">
          <FeaturedMixEditor {...props} />
          <FeaturedEditor
            values={props.values}
            setValues={props.setValues}
            options={props.options}
          />
          <BannerEditor values={props.values} setValues={props.setValues} />
        </TabsContent>
        <TabsContent value="busca" className="pt-4">
          <SearchSettingsEditor {...props} />
        </TabsContent>
        <TabsContent value="imoveis" className="pt-4">
          <PropertySeoEditor {...props} />
        </TabsContent>
        <TabsContent value="redirecionamentos" className="pt-4">
          <RedirectManager brand={props.brand} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

/** Identidade, SEO da home, redes, verificação, medição e privacidade — por marca. */
function IdentitySeoSection({ brand, values, setValues }: Props) {
  const set = (k: keyof SiteSettings, v: string) => setValues((s) => ({ ...s, [k]: v }));
  const host = SITE_PUBLIC_HOSTS[brand];
  const name = brand === "morar" ? "Morar Imóveis" : "Cordial Imóveis";
  const title = values.homeTitle || `${name} | Imobiliária em Santa Rosa/RS`;
  const issues = privacyIssues(values.privacy);
  const text = (k: keyof SiteSettings, label: string, help?: string, max?: number) => (
    <label className="block text-sm" key={k}>
      {label}
      <input
        className={input}
        value={String(values[k] ?? "")}
        maxLength={max}
        onChange={(e) => set(k, e.target.value)}
      />
      {max && (
        <span className="text-xs text-muted-foreground">
          {String(values[k] ?? "").length}/{max}
        </span>
      )}
      {help && <span className="block text-xs text-muted-foreground">{help}</span>}
    </label>
  );
  return (
    <div className="space-y-6">
      <fieldset className="space-y-2 rounded-md border p-4">
        <legend className="px-1 text-sm font-semibold">Política de privacidade</legend>
        {issues.length > 0 ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
          >
            Formulário de contato desativado: falta publicar a política de privacidade.{" "}
            {issues.join(" ")}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Política preenchida ({values.privacy.length} caracteres). O formulário de contato fica
            liberado após salvar.
          </p>
        )}
        <button
          type="button"
          className="rounded-md border px-3 py-1.5 text-sm"
          onClick={() => setValues((s) => ({ ...s, privacy: privacyTemplate(brand, s) }))}
        >
          Usar modelo como rascunho
        </button>
        <p className="text-xs text-muted-foreground">
          O modelo só preenche o campo acima; troque os marcadores entre colchetes e clique em
          salvar.
        </p>
      </fieldset>

      <fieldset className="grid gap-3 rounded-md border p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Site e Google — página inicial</legend>
        {text(
          "homeTitle",
          "Título da página inicial",
          "Usado inteiro. Ideal até 60 caracteres.",
          60,
        )}
        {text(
          "homeDescription",
          "Descrição da página inicial",
          values.homeDescription && values.homeDescription.length < 120
            ? "Recomendado entre 120 e 160 caracteres."
            : undefined,
          160,
        )}
        <div
          className="rounded-md bg-muted/40 p-3 text-sm md:col-span-2"
          aria-label="Prévia no Google"
        >
          <div className="text-xs text-muted-foreground">{host}</div>
          <div className="text-primary">{title}</div>
          <div className="text-xs text-muted-foreground">
            {values.homeDescription || "Encontre imóveis para comprar ou alugar."}
          </div>
        </div>
        {text(
          "socialImageUrl",
          "Imagem de compartilhamento (URL https, 1200×630)",
          "Vazio: usa a imagem padrão da marca.",
        )}
      </fieldset>

      <fieldset className="grid gap-3 rounded-md border p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Redes sociais (URL https)</legend>
        {text("instagram", "Instagram")}
        {text("facebook", "Facebook")}
        {text("youtube", "YouTube")}
        {text("tiktok", "TikTok")}
        {text("linkedin", "LinkedIn")}
      </fieldset>

      <fieldset className="grid gap-3 rounded-md border p-4 md:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Verificação e medição</legend>
        <label className="block text-sm">
          Google Search Console (código de verificação)
          <input
            className={input}
            value={values.googleSiteVerification}
            onChange={(e) => set("googleSiteVerification", verificationCode(e.target.value))}
          />
          <span className="text-xs text-muted-foreground">Pode colar a tag inteira.</span>
        </label>
        <label className="block text-sm">
          Bing Webmaster (código msvalidate.01)
          <input
            className={input}
            value={values.bingSiteVerification}
            onChange={(e) =>
              set("bingSiteVerification", verificationCode(e.target.value).toUpperCase())
            }
          />
        </label>
        {text("metaPixelId", "Meta Pixel — ID numérico", "Só carrega após o visitante aceitar.")}
        {text(
          "gtmContainerId",
          "Google Tag Manager — GTM-…",
          "Opcional. Se o GA4 também estiver no GTM, a medição fica duplicada.",
        )}
      </fieldset>
    </div>
  );
}
