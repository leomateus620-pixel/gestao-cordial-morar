import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-mock";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import { getSiteAudienceReport } from "@/lib/site-audience/report.functions";
import { SiteAudienceDashboard } from "./SiteAudienceDashboard";

export function SiteAudienceSection() {
  const session = useSession();
  const getReport = useServerFn(getSiteAudienceReport);
  const eligible =
    session?.perfil === "admin_owner" ||
    session?.perfil === "corretor" ||
    session?.perfil === "secretaria";
  const access = useQuery({
    queryKey: ["site-audience-brands", session?.id, session?.perfil],
    enabled: eligible,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("site_audience_allowed_brands");
      if (error) throw error;
      return (data ?? []).filter(
        (brand): brand is SiteBrand => brand === "cordial" || brand === "morar",
      );
    },
    refetchInterval: 20_000,
  });
  if (!session || !eligible) return null;
  if (access.isError)
    return (
      <p role="status" className="mb-5 text-sm">
        Não foi possível verificar o acesso à audiência dos sites.{" "}
        <button className="underline" onClick={() => void access.refetch()}>
          Tentar novamente
        </button>
      </p>
    );
  const [first, ...others] = access.data ?? [];
  if (!first) return null;

  const scope = [session.id, session.perfil, first, ...others].join("/");
  return (
    <SiteAudienceDashboard
      key={scope}
      scope={scope}
      brands={[first, ...others]}
      loadReport={(data) => getReport({ data })}
    />
  );
}
