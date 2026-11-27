import type { SiteBrand } from "../cordial-site/brand";
import { activateAudience, registerDocumentController } from "./client";
import type { AudienceAction, AudienceConfig, AudiencePage } from "./contract";
import type { AudienceView } from "./navigation";

export function audienceViewFromKey(key: string | undefined | null): AudienceView | null {
  const [page, propertyId, renderKey] = key?.split("|") ?? [];
  return page
    ? { page: page as AudiencePage, propertyId: propertyId || undefined, renderKey }
    : null;
}

type Controller = ReturnType<typeof activateAudience>;
type DocumentAudience = {
  brand: SiteBrand;
  controller: Controller;
  detach: () => void;
  onDisabled: () => void;
};
declare global {
  interface Window {
    __publicSiteDocumentAudience?: DocumentAudience;
  }
}

export function startDocumentAudience(
  marker: HTMLElement,
  brand: SiteBrand,
  config: AudienceConfig,
) {
  if (marker.dataset.attached || window.__publicSiteDocumentAudience) return;
  const view = audienceViewFromKey(marker.dataset.view);
  if (!view) return;
  const onLink = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      (event.type === "click" ? event.button !== 0 : event.button !== 1)
    )
      return;
    const link =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[data-site-audience-link]")
        : null;
    const action = link?.dataset.siteAudienceLink;
    if (!action) return;
    try {
      controller.action(JSON.parse(action) as AudienceAction);
    } catch {
      /* Optional measurement. */
    }
  };
  const detach = () => {
    window.removeEventListener("click", onLink);
    window.removeEventListener("auxclick", onLink);
  };
  const controller = activateAudience(brand, config, () => documentAudience.onDisabled());
  const documentAudience: DocumentAudience = { brand, controller, detach, onDisabled: detach };
  window.__publicSiteDocumentAudience = documentAudience;
  controller.updateView(view);
  window.addEventListener("click", onLink);
  window.addEventListener("auxclick", onLink);
}

export function attachDocumentAudience(
  brand: SiteBrand,
  config: AudienceConfig,
  onDisabled: () => void,
) {
  const early = window.__publicSiteDocumentAudience;
  if (early) {
    early.detach();
    delete window.__publicSiteDocumentAudience;
    if (
      early.brand === brand &&
      early.controller.policyVersion === config.policyVersion &&
      early.controller.eligible()
    ) {
      early.onDisabled = onDisabled;
      registerDocumentController(brand, early.controller);
      return early.controller;
    }
    early.controller.stop();
  }
  return activateAudience(brand, config, onDisabled);
}
