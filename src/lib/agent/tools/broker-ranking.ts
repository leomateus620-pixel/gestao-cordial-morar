import { z } from "zod";
import { attendanceQuery, OPEN_ATTENDANCE_STATUSES, rows } from "./common";
import { result, type AgentTool } from "./types";
export default {
  name: "broker_ranking",
  title: "Panorama dos corretores",
  description:
    "Contagem administrativa de atendimentos atribuídos e ativos por corretor. Ordenação por volume, sem inferir qualidade de desempenho.",
  roles: ["admin"],
  inputSchema: z.object({}).strict(),
  async handler(_input, ctx) {
    const data = await rows(
      attendanceQuery(ctx, "id,corretor_id,corretor_nome,status,imobiliaria")
        .order("created_at", { ascending: false })
        .limit(1000),
      ctx,
    );
    const grouped = new Map<string, any>();
    for (const a of data.slice(0, 1000)) {
      if (!a.corretor_id) continue;
      const broker = grouped.get(a.corretor_id) ?? {
        id: a.corretor_id,
        nome: a.corretor_nome || "Corretor",
        total: 0,
        ativos: 0,
        href: `/corretores?corretorId=${a.corretor_id}`,
      };
      broker.total++;
      if (OPEN_ATTENDANCE_STATUSES.includes(a.status)) broker.ativos++;
      grouped.set(a.corretor_id, broker);
    }
    const ranking = [...grouped.values()].sort((a, b) => b.total - a.total);
    return result(`${ranking.length} corretor(es) com atendimentos atribuídos na amostra.`, {
      ranking,
      total: ranking.length,
      limited: data.length >= 1000,
      criterio: "Volume de atendimentos atribuídos",
      href: "/corretores",
    });
  },
} satisfies AgentTool;
