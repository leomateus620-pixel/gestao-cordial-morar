import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMarketingActionPermissions } from "@/lib/ads/action-permissions.functions";
import { useSession } from "@/lib/auth-mock";
import { marketingActionAllowed } from "@/lib/marketing/action-access";

/** Presentation mirrors current server grants; each mutation still authorizes on the server. */
export function useMarketingActions() {
  const session = useSession();
  const get = useServerFn(getMarketingActionPermissions);
  const query = useQuery({
    queryKey: ["marketing", "action-permissions", session?.id, session?.perfil],
    queryFn: () => get(),
    enabled: Boolean(session),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  return {
    ...query,
    can: (action: string, agency?: string | null) =>
      marketingActionAllowed(query.data, action, agency, session?.perfil),
  };
}
