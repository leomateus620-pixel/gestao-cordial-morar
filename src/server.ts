import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import {
  isSiteRequest,
  guardSiteRequest,
  siteResponseHeaders,
} from "./lib/cordial-site/request.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const publicRequest = isSiteRequest(request);
      if (publicRequest) {
        const response = await guardSiteRequest(request);
        if (response) return response;
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(response);
      if (!publicRequest) return normalized;
      const headers = new Headers(normalized.headers);
      // TanStack's renderer derives status from router stores, overriding h3 status.
      // Consume only the private signal emitted by the withdrawn-property route.
      const withdrawn = headers.get("X-Cordial-Page-Status") === "410";
      headers.delete("X-Cordial-Page-Status");
      for (const [name, value] of Object.entries(siteResponseHeaders()))
        if (value) headers.set(name, value);
      if (normalized.headers.get("content-type")?.startsWith("image/"))
        headers.set("Cache-Control", normalized.headers.get("cache-control") ?? "no-store");
      return new Response(normalized.body, {
        status: withdrawn && normalized.status === 200 ? 410 : normalized.status,
        statusText: withdrawn && normalized.status === 200 ? "Gone" : normalized.statusText,
        headers,
      });
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
