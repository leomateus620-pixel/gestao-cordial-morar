/** One route policy shared by the shell and floating assistant. */
export function inspectionLayout(pathname: string): "central" | "workspace" | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "vistorias") return null;
  return parts.length === 1 ? "central" : "workspace";
}
