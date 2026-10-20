/** Reproduce original source locally for visual comparison, never a production route. */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
const commit = "c6a53a3d3f14a397637847fa973062b28382bba2";
mkdirSync("tmp/vistoria-baseline", { recursive: true });
for (const name of ["index", "nova", "$vistoriaId"]) {
  const source = execFileSync("git", ["show", `${commit}:src/routes/_app.vistorias.${name}.tsx`], {
    encoding: "utf8",
  })
    .replace("function VistoriasPage(", "export function VistoriasPage(")
    .replace("function NovaVistoria(", "export function NovaVistoria(")
    .replace("function VistoriaPage(", "export function VistoriaPage(")
    .replace(
      "const { vistoriaId } = Route.useParams();",
      'const vistoriaId="10000000-0000-4000-8000-000000000001";',
    );
  writeFileSync(`tmp/vistoria-baseline/${name}.tsx`, source);
}
