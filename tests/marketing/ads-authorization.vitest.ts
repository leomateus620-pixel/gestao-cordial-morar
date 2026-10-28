import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { requireAdsAdmin, requireMarketingAccess } from "../../src/lib/ads/authorization.server";
function context(roles: string[], agencies = ["cordial"]) {
  return {
    userId: "actor",
    supabase: {
      rpc: async (name: string, args: { _role: string; p_agency: string }) => ({
        data:
          name === "has_role"
            ? roles.includes(args._role)
            : name === "marketing_can_act" &&
              (roles.includes("admin") || agencies.includes(args.p_agency)),
        error: null,
      }),
    } as unknown as SupabaseClient,
  };
}
describe("Effective marketing roles", () => {
  it("honors frontend role priority instead of combining finance and operational powers", async () => {
    await expect(
      requireMarketingAccess(context(["financeiro", "secretaria"]), "cordial"),
    ).rejects.toMatchObject({ code: "no_permission" });
    await expect(requireMarketingAccess(context(["financeiro"]))).rejects.toMatchObject({
      code: "no_permission",
    });
    await expect(requireMarketingAccess(context(["corretor"]))).rejects.toMatchObject({
      code: "no_permission",
    });
  });
  it("permits the administrator and a secretary only in their agency", async () => {
    await expect(
      requireMarketingAccess(context(["admin", "financeiro", "secretaria"]), "morar"),
    ).resolves.toBeUndefined();
    await expect(
      requireMarketingAccess(context(["secretaria"]), "cordial"),
    ).resolves.toBeUndefined();
    await expect(requireMarketingAccess(context(["secretaria"]), "morar")).rejects.toMatchObject({
      code: "no_permission",
    });
  });
  it("keeps credentials exclusive to the administrator", async () => {
    await expect(requireAdsAdmin(context(["secretaria"]))).rejects.toMatchObject({
      code: "no_permission",
    });
    await expect(requireAdsAdmin(context(["admin"]))).resolves.toBeUndefined();
  });
  it("uses the authenticated agency RPC and refuses partial role lookup failures", async () => {
    const rpc = vi.fn(async (name: string, args: { _role?: string; p_agency?: string }) => {
      if (name === "has_role") return { data: args._role === "secretaria", error: null };
      if (name === "marketing_can_act") return { data: args.p_agency === "cordial", error: null };
      return { data: null, error: { code: "42501" } };
    });
    const ctx = { userId: "actor", supabase: { rpc } as unknown as SupabaseClient };
    await expect(requireMarketingAccess(ctx, "cordial")).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("marketing_can_act", {
      p_action: "read_metrics",
      p_agency: "cordial",
    });
    expect(rpc.mock.calls.some(([name]) => name === "has_notification_agency_access")).toBe(false);
    rpc.mockImplementation(async (name: string, args: { _role?: string; p_agency?: string }) => {
      if (name === "has_role" && args._role === "financeiro")
        return { data: null, error: { code: "provider_error" } };
      return { data: args._role === "secretaria", error: null };
    });
    await expect(requireMarketingAccess(ctx, "cordial")).rejects.toMatchObject({
      code: "no_permission",
    });
  });
});
