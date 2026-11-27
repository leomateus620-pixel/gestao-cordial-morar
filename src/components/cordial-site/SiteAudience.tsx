import { useEffect, useId, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getSiteBrand, type SiteBrand } from "@/lib/cordial-site/brand";
import { sitePath } from "@/lib/cordial-site/presentation";
import {
  activateAudience,
  audienceCredentials,
  audienceEndpoint,
  audienceStorageKeys,
  clearAudienceIdentity,
  readAudiencePreference,
  writeAudiencePreference,
} from "@/lib/site-audience/client";
import {
  audienceConfigSchema,
  type AudienceConfig,
  type AudiencePage,
} from "@/lib/site-audience/contract";
import { siteAudiencePage } from "@/lib/site-audience/navigation";
import { SiteLink } from "./SiteShell";

export function SiteAudience({ brand, hasPrivacy }: { brand: SiteBrand; hasPrivacy: boolean }) {
  const [config, setConfig] = useState<AudienceConfig | null>(null);
  const [preference, setPreference] = useState<ReturnType<typeof readAudiencePreference>>(null);
  const [editing, setEditing] = useState(false);
  const [configCheck, setConfigCheck] = useState(0);
  const rejectedPolicy = useRef<string | null>(null);
  const controller = useRef<ReturnType<typeof activateAudience> | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const panelId = useId();
  const siteName = getSiteBrand(brand).name;
  const pageKey = useRouterState({
    select: (state) => {
      const current = state.resolvedLocation;
      if (!current || state.status !== "idle") return undefined;
      const leaf = state.matches.at(-1);
      const base = getSiteBrand(brand).basePath;
      if (
        !leaf ||
        !leaf.routeId.startsWith(`${base}/`) ||
        leaf.pathname.replace(/\/$/, "") !== current.pathname.replace(/\/$/, "") ||
        state.matches.some((match) => match.status !== "success")
      )
        return null;
      const page = siteAudiencePage(current.pathname, current.search.finalidade, brand);
      if (!page) return null;
      if (page === "property") {
        const propertyId = (leaf.loaderData as { property?: { id: string } | null } | undefined)
          ?.property?.id;
        return propertyId ? `property|${propertyId}` : null;
      }
      // A listing and its articles have the same reporting bucket but each
      // committed page counts. Share capabilities themselves stay out of measurement.
      if (page === "news" || page === "information")
        return `${page}||${leaf.pathname.replace(/\/$/, "")}`;
      if (page === "selection") return `${page}||${leaf.routeId}`;
      return page;
    },
  });

  useEffect(() => {
    const key = audienceStorageKeys(brand).preference;
    const sync = () => setPreference(readAudiencePreference(brand));
    sync();
    const update = (event: StorageEvent) => {
      if (event.key === key || event.key === null) sync();
    };
    window.addEventListener("storage", update);
    return () => window.removeEventListener("storage", update);
  }, [brand]);

  useEffect(() => {
    const abort = new AbortController();
    void fetch(audienceEndpoint(brand), {
      credentials: audienceCredentials(brand),
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok || abort.signal.aborted) return;
        const result = await response.json();
        if (abort.signal.aborted) return;
        const parsed = audienceConfigSchema.safeParse(result);
        if (parsed.success && parsed.data.policyVersion !== rejectedPolicy.current)
          setConfig(parsed.data);
        else if (result?.enabled === false) {
          setConfig(null);
          clearAudienceIdentity(brand);
        }
      })
      .catch(() => {});
    return () => abort.abort();
  }, [brand, configCheck]);

  const approved = config && (config.notice || hasPrivacy) ? config : null;
  const choice = preference?.policyVersion === approved?.policyVersion ? preference?.choice : null;
  useEffect(() => {
    if (!approved || choice !== "granted") {
      if (approved) clearAudienceIdentity(brand);
      return;
    }
    const next = activateAudience(brand, approved, () => {
      rejectedPolicy.current = approved.policyVersion;
      setConfig(null);
      setConfigCheck((previous) => previous + 1);
    });
    controller.current = next;
    return () => {
      controller.current = null;
      next.stop();
    };
  }, [brand, approved, choice]);

  useEffect(() => {
    if (pageKey === undefined) return;
    const [page, propertyId, renderKey] = pageKey?.split("|") ?? [];
    controller.current?.updateView(
      page ? { page: page as AudiencePage, propertyId: propertyId || undefined, renderKey } : null,
    );
  }, [pageKey, brand, approved, choice]);

  useEffect(() => {
    if (editing) panel.current?.focus();
  }, [editing]);

  if (!approved && preference?.choice !== "granted") return null;

  const dismiss = () => {
    setEditing(false);
    if (editing) button.current?.focus();
  };
  const choose = (next: "granted" | "denied") => {
    const version = approved?.policyVersion ?? preference?.policyVersion;
    if (!version) return;
    if (next === "denied") controller.current?.stop();
    const saved = { policyVersion: version, choice: next };
    setPreference(writeAudiencePreference(brand, saved) ? saved : { ...saved, choice: "denied" });
    if (next === "denied") clearAudienceIdentity(brand);
    dismiss();
  };
  const panelOpen = Boolean((approved && !choice) || editing);
  return (
    <>
      <button
        className="cs-text-link"
        ref={button}
        type="button"
        aria-controls={panelOpen ? panelId : undefined}
        aria-expanded={panelOpen}
        onClick={() => setEditing(true)}
      >
        Métricas de audiência
      </button>
      {panelOpen && (
        <section
          className="cs-analytics-consent cs-audience-consent"
          aria-label="Preferências de audiência"
          id={panelId}
          ref={panel}
          tabIndex={-1}
          data-editing={editing || undefined}
          onKeyDown={(event) => {
            if (event.key === "Escape" && editing) dismiss();
          }}
        >
          {approved?.notice ? (
            <>
              <p>
                Com sua permissão, a {siteName} mede como as visitas chegam ao site e como as
                pessoas usam páginas, busca e fichas. Você pode recusar ou mudar a escolha no
                rodapé.
              </p>
              <details className="cs-audience-details">
                <summary>Como funciona a medição</summary>
                <div className="cs-audience-disclosure">
                  <p className="cs-audience-notice-text">{approved.notice}</p>
                  <p>
                    Versão {approved.policyVersion} ·{" "}
                    <SiteLink to={sitePath("/contato", brand)}>Contato da {siteName}</SiteLink>
                  </p>
                </div>
              </details>
            </>
          ) : approved ? (
            <p>
              Com sua permissão, medimos a navegação neste site para entender quais páginas e
              imóveis são mais visitados. Você pode mudar sua escolha aqui a qualquer momento.{" "}
              <SiteLink to={sitePath("/privacidade", brand)}>Ler política de privacidade</SiteLink>
            </p>
          ) : (
            <p>A coleta está indisponível. Você pode revogar a permissão salva neste navegador.</p>
          )}
          <div>
            <button
              type="button"
              className="cs-button cs-button-light"
              onClick={() => choose("denied")}
            >
              {preference?.choice === "granted" ? "Revogar permissão" : "Recusar audiência"}
            </button>
            {approved && (
              <button
                type="button"
                className="cs-button cs-button-light"
                onClick={() => choose("granted")}
              >
                Aceitar audiência
              </button>
            )}
            {editing && (!approved || choice) && (
              <button className="cs-text-link" type="button" onClick={dismiss}>
                Fechar preferências
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
