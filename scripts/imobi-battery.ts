/* Script temporário de validação da integração ImobiBrasil (execução manual). */
import { createClient } from "@supabase/supabase-js";
import { refreshProviderCatalogs, fetchAccountStatus } from "@/lib/imobibrasil/catalogs.server";

const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
  auth: { persistSession: false },
});

const provider = (process.argv[2] ?? "cordial") as "cordial" | "morar";

console.log("status:", await fetchAccountStatus(provider));
console.log("catalogos:", await refreshProviderCatalogs(admin, provider));
