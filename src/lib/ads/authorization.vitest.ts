import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  marketingRoleAllows,
  marketingAccess,
  visibleAdPlatforms,
  requireAdsAdmin,
  requireMarketingAction,
  type MarketingAction,
} from "./authorization.server";
const actions: MarketingAction[] = [
  "read_metrics",
  "read_ad_budget",
  "read_lead_contacts",
  "manage_leads",
  "create_draft",
  "send_paused",
  "change_budget",
  "set_delivery",
  "generate_report",
  "financial_report",
  "manage_connection",
  "manage_manual",
];
function context(roles: string[], allowedAgency = "cordial") {
  const rpc = vi.fn(async (name, args) => ({
    data: name === "has_role" ? roles.includes(args._role) : args.p_agency === allowedAgency,
    error: null,
  }));
  return { supabase: { rpc } as unknown as SupabaseClient, userId: "actor", rpc };
}
describe("explicit marketing authorization", () => {
  it.each([
    ["meta_reviewer"],
    ["meta_reviewer", "admin"],
    ["meta_reviewer", "secretaria"],
    ["meta_reviewer", "financeiro", "admin"],
  ])("reviewer deny dominates %j", (...roles) => {
    for (const action of actions)
      expect(marketingRoleAllows(new Set(roles), action)).toBe(action === "read_metrics");
  });
  it("does not automatically grant financial or broker access", () => {
    for (const role of ["financeiro", "corretor"])
      for (const action of actions)
        expect(marketingRoleAllows(new Set([role]), action)).toBe(false);
    expect(marketingRoleAllows(new Set(["secretaria", "financeiro"]), "manage_leads")).toBe(false);
  });
  it("secretary keeps operational access without finance or external delivery", () => {
    expect(marketingRoleAllows(new Set(["secretaria"]), "manage_leads")).toBe(true);
    expect(marketingRoleAllows(new Set(["secretaria"]), "generate_report")).toBe(true);
    for (const action of [
      "financial_report",
      "send_paused",
      "change_budget",
      "set_delivery",
    ] as const)
      expect(marketingRoleAllows(new Set(["secretaria"]), action)).toBe(false);
  });
  it("does not expose a Google connection placeholder to a mixed reviewer", async () => {
    const access = await marketingAccess(context(["admin", "meta_reviewer"]));
    expect(visibleAdPlatforms(access.isReviewer)).toEqual(["meta"]);
  });
  it("admin helper rejects mixed reviewer before checking privileged objects", async () => {
    await expect(requireAdsAdmin(context(["admin", "meta_reviewer"]))).rejects.toMatchObject({
      code: "no_permission",
    });
  });
  it("enforces action + exact agency at the server boundary", async () => {
    const ctx = context(["secretaria"]);
    await expect(requireMarketingAction(ctx, "read_lead_contacts", "morar")).rejects.toMatchObject({
      code: "no_permission",
    });
    expect(ctx.rpc).toHaveBeenCalledWith("marketing_can_act", {
      p_action: "read_lead_contacts",
      p_agency: "morar",
    });
    await expect(requireMarketingAction(ctx, "manage_leads", "cordial")).resolves.toMatchObject({
      isAdmin: false,
      financialVisible: false,
    });
  });
  it("fails closed when role lookup fails", async () => {
    const ctx = context(["admin"]);
    ctx.rpc.mockResolvedValue({ data: false, error: { message: "unavailable" } } as never);
    await expect(requireMarketingAction(ctx, "read_metrics")).rejects.toMatchObject({
      code: "no_permission",
    });
  });
  it("accepts explicit Meta grants for the named secretary but keeps finance and administration denied", async () => {
    const ctx = context(["secretaria", "corretor"]);
    ctx.rpc.mockImplementation(async (name, args) => ({
      data:
        name === "has_role"
          ? ["secretaria", "corretor"].includes(args._role)
          : ["read_ad_budget", "send_paused", "change_budget", "set_delivery"].includes(
              args.p_action,
            ) &&
            (!args.p_agency || args.p_agency === "cordial"),
      error: null,
    }));
    await expect(requireMarketingAction(ctx, "send_paused", "cordial")).resolves.toMatchObject({
      isAdmin: false,
      financialVisible: false,
    });
    await expect(requireMarketingAction(ctx, "read_ad_budget", "morar")).rejects.toMatchObject({
      code: "no_permission",
    });
    await expect(requireMarketingAction(ctx, "financial_report", "cordial")).rejects.toMatchObject({
      code: "no_permission",
    });
    await expect(requireAdsAdmin(ctx)).rejects.toMatchObject({ code: "no_permission" });
  });
});
