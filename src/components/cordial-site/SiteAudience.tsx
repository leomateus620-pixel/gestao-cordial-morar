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
  // Audience runs for every visitor without a banner (owner decision); explained on the privacy page.
  const choice = "granted" as const;
  void preference;
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

  return null;
}
