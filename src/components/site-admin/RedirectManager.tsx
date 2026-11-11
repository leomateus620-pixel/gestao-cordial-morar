import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { SiteBrand } from "@/lib/cordial-site/brand";
import {
  applySiteRedirects,
  deleteSiteRedirect,
  listSiteRedirects,
  previewSiteRedirects,
} from "@/lib/cordial-site/redirects.functions";
import type { RedirectPreview } from "@/lib/cordial-site/redirect-import";

const btn = "rounded-md border px-3 py-1.5 text-sm disabled:opacity-50";
const statusLabel: Record<RedirectPreview["status"], string> = {
  valido: "Novo",
  substitui: "Substitui o atual",
  endereco_invalido: "Endereço inválido",
  nao_encontrado: "Imóvel não publicado",
  outra_marca: "Imóvel da outra marca",
  repetido: "Linha repetida",
};

/** Endereços antigos (ImobiBrasil) → imóvel atual. Só administrador; separado por marca. */
export function RedirectManager({ brand }: { brand: SiteBrand }) {
  const list = useServerFn(listSiteRedirects);
  const preview = useServerFn(previewSiteRedirects);
  const apply = useServerFn(applySiteRedirects);
  const remove = useServerFn(deleteSiteRedirect);
  const query = useQuery({
    queryKey: ["site-redirects", brand],
    queryFn: () => list({ data: { brand } }),
  });
  const [csv, setCsv] = useState("");
  const [rows, setRows] = useState<RedirectPreview[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setBusy(false);
    }
  };
  const ok = rows?.filter((r) => r.status === "valido" || r.status === "substitui").length ?? 0;
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Endereços antigos do tipo /imovel/2093999 já são levados automaticamente ao anúncio novo
        quando o imóvel tem o código antigo. Use esta aba para casos especiais. Imóveis retirados
        mostram a página "retirado do catálogo".
      </p>
      <fieldset className="space-y-2 rounded-md border p-4">
        <legend className="px-1 text-sm font-semibold">Importar planilha (CSV)</legend>
        <p className="text-xs text-muted-foreground">
          Duas colunas por linha: endereço antigo; referência do imóvel. Ex.:
          https://site-antigo/imovel/2093999;1398
        </p>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setCsv(await f.text());
            setRows(null);
          }}
        />
        <textarea
          className="w-full rounded-md border bg-background p-2 font-mono text-xs"
          rows={5}
          value={csv}
          onChange={(e) => {
            setCsv(e.target.value);
            setRows(null);
          }}
          placeholder="/imovel/2093999;1398"
        />
        <div className="flex gap-2">
          <button
            type="button"
            className={btn}
            disabled={!csv.trim() || busy}
            onClick={() => run(async () => setRows(await preview({ data: { brand, csv } })))}
          >
            Ver prévia
          </button>
          <button
            type="button"
            className={btn}
            disabled={!ok || busy}
            onClick={() =>
              run(async () => {
                const r = await apply({ data: { brand, csv } });
                setMsg(`${r.applied} redirecionamento(s) salvos.`);
                setRows(null);
                setCsv("");
                await query.refetch();
              })
            }
          >
            Confirmar {ok} válido(s)
          </button>
        </div>
        {rows && (
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th>Linha</th>
                <th>Endereço antigo</th>
                <th>Referência</th>
                <th>Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.line}
                  className={
                    r.status === "valido" || r.status === "substitui" ? "" : "text-destructive"
                  }
                >
                  <td>{r.line}</td>
                  <td>{r.oldPath ?? r.raw}</td>
                  <td>{r.reference}</td>
                  <td>{statusLabel[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </fieldset>
      {msg && (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
      <fieldset className="space-y-2 rounded-md border p-4">
        <legend className="px-1 text-sm font-semibold">
          Redirecionamentos manuais ({query.data?.length ?? 0})
        </legend>
        {query.isError && (
          <p className="text-sm text-destructive">Não foi possível carregar a lista.</p>
        )}
        <ul className="divide-y text-sm">
          {query.data?.map((r) => (
            <li key={r.oldPath} className="flex items-center gap-2 py-1.5">
              <span className="mr-auto font-mono text-xs">
                {r.oldPath} → REF. {r.reference ?? "retirado"}
              </span>
              <button
                type="button"
                className={btn}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await remove({ data: { brand, oldPath: r.oldPath } });
                    await query.refetch();
                  })
                }
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
