import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { shouldInstallCordialGtm } from "./gtm-install";
import { isGtmId } from "./meta-pixel";

/** Decides on the server, from the real request host, whether the Cordial GTM tag is rendered. */
export const cordialGtmDecision = createServerFn({ method: "GET" })
  .inputValidator((input: { containerId: string }) => ({
    containerId: isGtmId(String(input?.containerId ?? "")) ? String(input.containerId) : "",
  }))
  .handler(({ data }) => {
    const url = new URL(getRequest().url);
    const forwarded =
      url.hostname === "localhost" ? getRequest().headers.get("x-forwarded-host") : null;
    const host = forwarded || url.host;
    const ok = shouldInstallCordialGtm({
      host,
      pathname: "/",
      containerId: data.containerId,
      cordialHostOverride: process.env.VITE_CORDIAL_SITE_PUBLIC_HOST ?? null,
    });
    return ok ? { id: data.containerId } : null;
  });
