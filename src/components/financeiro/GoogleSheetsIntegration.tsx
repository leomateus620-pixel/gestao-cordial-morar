import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Link2,
  Loader2,
  RefreshCw,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSheetsIntegration } from "@/hooks/useSheetsIntegration";
import { useSession } from "@/lib/auth-mock";
import { isAdminUser } from "@/lib/access-control";

export function GoogleSheetsIntegration() {
  const session = useSession();
  const admin = isAdminUser(session);
  const { config, isLoadingConfig, save, preview, import: importMut, disconnect } =
    useSheetsIntegration();

  const [spreadsheetIdOrUrl, setSpreadsheetIdOrUrl] = useState("");
  const [sheetName, setSheetName] = useState("Sheet1");
  const [range, setRange] = useState("A2:H1000");
  const [headerRow, setHeaderRow] = useState(1);

  // Prefill when config loads
  const configId = config?.id;
  if (config && !spreadsheetIdOrUrl && configId) {
    // one-shot prefill using state setter
    setSpreadsheetIdOrUrl(config.spreadsheetId);
    setSheetName(config.sheetName);
    setRange(config.range);
    setHeaderRow(config.headerRow);
  }

  const connected = Boolean(config);

  const onSave = async () => {
    try {
      await save.mutateAsync({ spreadsheetIdOrUrl, sheetName, range, headerRow });
      toast.success("Planilha vinculada com sucesso.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar configuração.");
    }
  };

  const onPreview = async () => {
    try {
      await preview.mutateAsync({ limit: 10 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler planilha.");
    }
  };

  const onImport = async () => {
    try {
      const res = await importMut.mutateAsync();
      const msg = `Importação concluída: ${res.inserted} novos, ${res.updated} atualizados, ${res.skipped} ignorados.`;
      if (res.errors.length) {
        toast.warning(msg);
      } else {
        toast.success(msg);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação.");
    }
  };

  const onDisconnect = async () => {
    try {
      await disconnect.mutateAsync();
      setSpreadsheetIdOrUrl("");
      toast.success("Planilha desvinculada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao desvincular.");
    }
  };

  if (!admin) {
    return (
      <section className="glass-panel rounded-3xl p-6">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileSpreadsheet className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Integração Google Sheets</h2>
            <p className="mt-1 text-sm text-foreground/60">
              Apenas administradores podem configurar e importar dados da planilha.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="glass-panel rounded-3xl p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-700">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold">Google Sheets</h2>
              <p className="mt-1 text-xs text-foreground/60">
                Importe lançamentos financeiros diretamente de uma planilha Google. A
                conexão OAuth é gerenciada pelo Lovable — nenhum token é armazenado no app.
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              connected
                ? "bg-emerald-500/15 text-emerald-700"
                : "bg-foreground/8 text-foreground/60"
            }`}
          >
            {connected ? (
              <>
                <CheckCircle2 className="size-3.5" /> Conectado
              </>
            ) : (
              <>
                <Link2 className="size-3.5" /> Não conectado
              </>
            )}
          </span>
        </header>

        {isLoadingConfig ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-foreground/60">
            <Loader2 className="size-4 animate-spin" /> Carregando configuração…
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="sheet-id">URL ou ID da planilha</Label>
              <Input
                id="sheet-id"
                value={spreadsheetIdOrUrl}
                onChange={(e) => setSpreadsheetIdOrUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
              />
              <p className="mt-1 text-[11px] text-foreground/55">
                Compartilhe a planilha com a conta Google conectada no workspace.
              </p>
            </div>
            <div>
              <Label htmlFor="sheet-name">Aba</Label>
              <Input
                id="sheet-name"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="Sheet1"
              />
            </div>
            <div>
              <Label htmlFor="sheet-range">Range</Label>
              <Input
                id="sheet-range"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                placeholder="A2:H1000"
              />
            </div>
            <div>
              <Label htmlFor="sheet-header">Linha do cabeçalho</Label>
              <Input
                id="sheet-header"
                type="number"
                min={1}
                value={headerRow}
                onChange={(e) => setHeaderRow(Number(e.target.value) || 1)}
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            onClick={onSave}
            disabled={save.isPending || !spreadsheetIdOrUrl.trim()}
          >
            {save.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 size-4" />
            )}
            Salvar e validar
          </Button>
          <Button
            variant="outline"
            onClick={onPreview}
            disabled={!connected || preview.isPending}
          >
            {preview.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Eye className="mr-2 size-4" />
            )}
            Prévia
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={!connected || importMut.isPending}
              >
                {importMut.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Download className="mr-2 size-4" />
                )}
                Importar agora
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Importar lançamentos da planilha?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cada linha vira um lançamento em Financeiro. Reimportações
                  atualizam os lançamentos existentes (identificados por planilha +
                  linha), não geram duplicatas.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onImport}>Importar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {connected ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive hover:text-destructive">
                  <Unlink className="mr-2 size-4" /> Desvincular
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Desvincular planilha?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Os lançamentos já importados permanecem no sistema. Você pode
                    reconectar depois.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onDisconnect}>Desvincular</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>

        {config?.lastImportAt ? (
          <p className="mt-4 flex items-center gap-1.5 text-[11px] text-foreground/55">
            <RefreshCw className="size-3" />
            Última importação:{" "}
            {new Date(config.lastImportAt).toLocaleString("pt-BR")} —{" "}
            {config.lastImportCount ?? 0} lançamentos processados.
          </p>
        ) : null}
      </section>

      <section className="glass-panel rounded-3xl p-6">
        <h3 className="text-sm font-semibold">Formato esperado das colunas</h3>
        <p className="mt-1 text-xs text-foreground/60">
          A planilha deve conter, nesta ordem, as seguintes colunas (linha 1 é o
          cabeçalho; dados a partir da linha 2):
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] uppercase tracking-wider text-foreground/55">
              <tr>
                <th className="p-2">Coluna</th>
                <th className="p-2">Formato / valores aceitos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/8">
              <Row col="A · data" v="YYYY-MM-DD ou DD/MM/AAAA" />
              <Row col="B · descricao" v="Texto livre" />
              <Row col="C · categoria" v="Texto livre" />
              <Row col="D · tipo" v="entrada · saida" />
              <Row col="E · valor" v="Ex.: 1.234,56 ou 1234.56 (positivo)" />
              <Row col="F · imobiliaria" v="cordial · morar · ambas" />
              <Row col="G · status" v="Pago · Pendente · Atrasado · Cancelado" />
              <Row col="H · corretor_email" v="Opcional. Email cadastrado no sistema." />
            </tbody>
          </table>
        </div>
      </section>

      {preview.data ? (
        <section className="glass-panel rounded-3xl p-6">
          <h3 className="text-sm font-semibold">
            Prévia — {preview.data.spreadsheetTitle} ({preview.data.totalRows} linhas
            no range)
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase tracking-wider text-foreground/55">
                <tr>
                  {(preview.data.headers.length
                    ? preview.data.headers
                    : Array.from({ length: preview.data.rows[0]?.length ?? 0 }, (_, i) =>
                        `Col ${i + 1}`,
                      )
                  ).map((h, i) => (
                    <th key={i} className="p-2">
                      {h || `Col ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/8">
                {preview.data.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className="p-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {importMut.data && importMut.data.errors.length ? (
        <section className="glass-panel rounded-3xl border border-amber-500/30 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-700">
            <AlertCircle className="size-4" /> {importMut.data.errors.length} linhas
            ignoradas
          </h3>
          <ul className="mt-3 space-y-1 text-xs">
            {importMut.data.errors.slice(0, 30).map((err) => (
              <li key={err.linha} className="text-foreground/70">
                <span className="font-mono font-semibold">L{err.linha}</span>:{" "}
                {err.motivo}
              </li>
            ))}
            {importMut.data.errors.length > 30 ? (
              <li className="italic text-foreground/50">
                …e mais {importMut.data.errors.length - 30}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Row({ col, v }: { col: string; v: string }) {
  return (
    <tr>
      <td className="p-2 font-mono text-[11px]">{col}</td>
      <td className="p-2 text-foreground/70">{v}</td>
    </tr>
  );
}
