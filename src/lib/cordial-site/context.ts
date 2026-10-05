import { createContext, useContext } from "react";
import type { SiteBootstrap } from "./contract";
import type { SiteBrand } from "./brand";
export const SiteBrandContext = createContext<SiteBrand>("cordial");
export const useSiteBrand = () => useContext(SiteBrandContext);
export const SiteContext = createContext<SiteBootstrap | null>(null);
export function useSite() {
  const value = useContext(SiteContext);
  if (!value) throw new Error("Site context missing");
  return value;
}
