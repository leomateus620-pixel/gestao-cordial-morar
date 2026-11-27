import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { getSiteBrand, type SiteBrand } from "@/lib/cordial-site/brand";
import {
  activateAudience,
  audienceCredentials,
  audienceEndpoint,
  clearAudienceIdentity,
} from "@/lib/site-audience/client";
import { audienceConfigSchema, type AudienceConfig } from "@/lib/site-audience/contract";
import { attachDocumentAudience, audienceViewFromKey } from "@/lib/site-audience/document";
import earlyModule from "@/lib/site-audience/document-entry.ts?worker&url";
import { siteAudiencePage } from "@/lib/site-audience/navigation";

export function SiteAudience({
  brand,
  hasPrivacy,
  initialConfig,
}: {
  brand: SiteBrand;
  hasPrivacy: boolean;
  initialConfig?: AudienceConfig | null;
}) {
  const [documentConfig] = useState(initialConfig);
  const generation = useRef(0);
  const marker = useRef<HTMLSpanElement>(null);
  const [config, setConfig] = useState<AudienceConfig | null>(documentConfig ?? null);
  const [configCheck, setConfigCheck] = useState(0);
  const rejectedPolicy = useRef<string | null>(null);
  const controller = useRef<ReturnType<typeof activateAudience> | null>(null);
  const pageKey = useRouterState({
    select: (state) => {
      const current = state.resolvedLocation ?? state.location;
      if (state.resolvedLocation && state.status !== "idle") return undefined;
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
    if (configCheck === 0 && documentConfig && (documentConfig.notice || hasPrivacy)) return;
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
  }, [brand, configCheck, documentConfig, hasPrivacy]);

  const approved = config && (config.notice || hasPrivacy) ? config : null;
  useEffect(() => {
    const run = ++generation.current;
    if (!approved) {
      controller.current?.stop();
      controller.current = null;
      return;
    }
    if (marker.current) marker.current.dataset.attached = "true";
    if (controller.current?.policyVersion !== approved.policyVersion) {
      controller.current = attachDocumentAudience(brand, approved, () => {
        rejectedPolicy.current = approved.policyVersion;
        setConfig(null);
        setConfigCheck((previous) => previous + 1);
      });
    }
    return () => {
      // React can immediately reattach the same rendered page in Strict Mode.
      queueMicrotask(() => {
        if (generation.current !== run) return;
        controller.current?.stop();
        controller.current = null;
      });
    };
  }, [brand, approved]);

  useEffect(() => {
    if (pageKey === undefined) return;
    controller.current?.updateView(audienceViewFromKey(pageKey));
  }, [pageKey, brand, approved]);

  if (!documentConfig || !(documentConfig.notice || hasPrivacy)) return null;
  return (
    <>
      <span
        hidden
        ref={marker}
        data-site-audience-initial={brand}
        data-view={pageKey ?? undefined}
        data-config={JSON.stringify(documentConfig)}
      />
      <script type="module" async src={earlyModule} />
    </>
  );
}
