import { useServerFn } from "@tanstack/react-start";
import { useSession } from "@/lib/auth-mock";
import { getSiteAudienceReport } from "@/lib/site-audience/report.functions";
import { SiteAudienceDashboard } from "./SiteAudienceDashboard";

export function SiteAudienceSection() {
  const session = useSession();
  const getReport = useServerFn(getSiteAudienceReport);
  if (session?.perfil !== "admin_owner") return null;

  return (
    <SiteAudienceDashboard
      key={session.id}
      scope={session.id}
      loadReport={(data) => getReport({ data })}
    />
  );
}
