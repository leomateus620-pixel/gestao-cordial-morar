import { startDocumentAudience } from "./document";

function start() {
  const marker = document.querySelector<HTMLElement>("[data-site-audience-initial]");
  if (!marker) return false;
  const brand = marker.dataset.siteAudienceInitial;
  if (!marker.dataset.attached && (brand === "cordial" || brand === "morar")) {
    try {
      const config = JSON.parse(marker.dataset.config ?? "null");
      if (config?.enabled && config.policyVersion) startDocumentAudience(marker, brand, config);
    } catch {
      /* Site navigation remains available. */
    }
  }
  return true;
}

// A cached async module can run while the HTML parser is still delivering the shell.
if (!start() && document.readyState === "loading") {
  const parser = new MutationObserver(() => {
    if (start()) parser.disconnect();
  });
  parser.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener(
    "DOMContentLoaded",
    () => {
      parser.disconnect();
      start();
    },
    { once: true },
  );
}
