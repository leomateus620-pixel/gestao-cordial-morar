import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BrandGates, CompetenceRows } from "./competence-status";

const input = z.object({
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  contractIds: z.array(z.uuid()).max(200),
});

/**
 * Estado das emissões de uma competência para vários contratos de uma vez.
 * Dados lidos com o cliente do usuário (RLS); as travas por marca (boleto liberado em
 * produção e modo teste da NF) são só booleanos de configuração.
 */
export const listRentalCompetenceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: z.infer<typeof input>) => input.parse(data))
  .handler(async ({ data, context }) => {
    const empty: CompetenceRows = { emissions: [], boletos: [], nfse: [] };
    if (data.contractIds.length === 0) return { rows: empty, gates: {} as BrandGates, showNf: false };
    const db = context.supabase;
    const [isAdmin, isFin] = await Promise.all([
      db.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      db.rpc("has_role", { _user_id: context.userId, _role: "financeiro" }),
    ]);
    const showNf = isAdmin.data === true || isFin.data === true;
    const [em, bo, nf] = await Promise.all([
      db.from("rental_emissions").select("contract_id,tipo,status")
        .eq("competencia", data.competencia).eq("tipo", "recibo").in("contract_id", data.contractIds),
      db.from("rental_boletos").select("contract_id,ambiente,estado")
        .eq("competencia", data.competencia).in("contract_id", data.contractIds),
      showNf
        ? db.from("rental_nfse_emissions").select("contract_id,status")
            // NFS-e guarda a competência como data (primeiro dia do mês).
            .eq("competencia", `${data.competencia}-01`).in("contract_id", data.contractIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (em.error) {
      console.error("[competence-status] recibos", em.error.message);
      throw new Error("Não foi possível carregar a situação do mês.");
    }
    // Boleto/NF sem leitura confiável ficam de fora (nunca exibidos como pendentes).
    if (bo.error) console.error("[competence-status] boletos", bo.error.message);
    if (nf.error) console.error("[competence-status] nfse", nf.error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [accounts, nfse] = await Promise.all([
      supabaseAdmin.from("billing_accounts").select("brand,ambiente,emissao_habilitada,liberado_em"),
      supabaseAdmin.from("nfse_provider_settings").select("brand,modo_teste"),
    ]);
    const gates: BrandGates = {};
    for (const brand of ["cordial", "morar"]) {
      const boletoAtivo = (accounts.data ?? []).some(
        (a) => a.brand === brand && a.ambiente === "producao" && a.emissao_habilitada === true && !!a.liberado_em,
      );
      const setting = (nfse.data ?? []).find((s) => s.brand === brand);
      gates[brand] = { boletoAtivo: !accounts.error && !bo.error && boletoAtivo, nfModoTeste: nfse.error || !setting ? true : setting.modo_teste !== false };
    }
    return {
      rows: {
        emissions: (em.data ?? []) as CompetenceRows["emissions"],
        boletos: (bo.data ?? []) as CompetenceRows["boletos"],
        nfse: (nf.data ?? []) as CompetenceRows["nfse"],
      },
      gates,
      showNf: showNf && !nf.error,
    };
  });
