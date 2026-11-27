import { createIsomorphicFn } from "@tanstack/react-start";
import { getSiteBrand, type SiteBrand } from "../cordial-site/brand";
import type { AudienceConfig } from "./contract";

// The first delivered page can use its own verified public configuration during hydration.
// Catalog rendering has a bounded fallback when the optional analytics service is slow.
export const documentAudienceConfig = createIsomorphicFn()
  .client(async (_brand: SiteBrand): Promise<AudienceConfig | null> => null)
  .server(async (brand: SiteBrand): Promise<AudienceConfig | null> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { publicSiteAudience } = await import("./http.server");
    const incoming = getRequest();
    const headers = new Headers();
    for (const name of ["user-agent", "cf-connecting-ip"]) {
      const value = incoming.headers.get(name);
      if (value) headers.set(name, value);
    }
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const request = new Request(
        new URL(getSiteBrand(brand).apiBase + "/audience", incoming.url),
        {
          headers,
          signal: abort.signal,
        },
      );
      const read = async () => {
        const response = await publicSiteAudience(request, brand);
        const config = response.ok ? await response.json() : null;
        return config?.enabled === true ? (config as AudienceConfig) : null;
      };
      return await Promise.race([
        read(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            abort.abort();
            resolve(null);
          }, 750);
        }),
      ]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
