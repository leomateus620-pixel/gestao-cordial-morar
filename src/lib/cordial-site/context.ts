import { createContext, useContext } from "react";
import type { SiteBootstrap } from "./contract";
export const SiteContext = createContext<SiteBootstrap | null>(null);
export function useSite() {
  const value = useContext(SiteContext);
  if (!value) throw new Error("Site context missing");
  return value;
}
