import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { refreshOwnerLinks } from "@/lib/imobibrasil/owner-links.server";
const prov = process.argv[2] as "cordial"|"morar";
const r = await refreshOwnerLinks(supabaseAdmin as never, prov, { contactBatch: Number(process.argv[3] ?? 0), skipList: process.argv[4] === "skip", correlationId: "owner-links-2026-09-22" });
await Bun.write(`/tmp/own/report-${prov}.json`, JSON.stringify(r));
console.log(JSON.stringify({ ...r, semProprietarioNoSite: r.semProprietarioNoSite.length, divergenciasContato: r.divergenciasContato.length }));
