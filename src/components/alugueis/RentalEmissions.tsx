import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Barcode,
  Check,
  Copy,
  FileCheck2,
  FileText,
  Loader2,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useRentalNfse } from "@/hooks/useRentalNfse";
import {
  getReceiptCompanyTaxId,
  getRentalEmissionUrl,
  listRentalEmissions,
  registerRentalReceipt,
} from "@/lib/rentals/emissions.functions";
import { buildReceiptModel, type ReceiptInput } from "@/lib/rentals/receipt-model";
import { buildReceiptPdf } from "@/lib/rentals/receipt-pdf";
import { brl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RentalContractFull } from "@/types/rental";
import { ReceiptModal } from "./ReceiptModal";

function FileSlot({
  name,
  date,
  open,
  copy,
}: {
  name?: string | null;
  date?: string;
  open?: () => void;
  copy?: () => Promise<string>;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const formattedDate = date
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .format(new Date(date))
        .replace(",", "")
    : "";
  if (!name)
    return (
      <div className="mt-4 flex min-h-16 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
        <FileText className="size-4" />
        Nenhum arquivo emitido
      </div>
    );
  return (
    <div className="mt-4 flex min-h-16 min-w-0 items-center gap-2 rounded-lg border border-border px-2">
      <FileText className="size-4 shrink-0 text-muted-foreground" />
      <Button
        variant="link"
        disabled={!open}
        onClick={open}
        className="h-auto min-w-0 flex-1 flex-col items-start gap-1 whitespace-normal px-0 py-2 text-left"
      >
        <span className="line-clamp-2 w-full break-words text-xs">{name}</span>
        <span className="text-[10px] font-normal text-muted-foreground">{formattedDate}</span>
      </Button>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={copied ? "Copiado" : `Copiar ${name}`}
            disabled={!copy}
            onClick={async () => {
              try {
                if (!copy) return;
                await navigator.clipboard.writeText(await copy());
                setCopied(true);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => setCopied(false), 1500);
              } catch {
                toast.error("Não foi possível copiar o link.");
              }
            }}
          >
            {copied ? <Check className="text-emission-nf" /> : <Copy />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{copied ? "Copiado" : "Copiar"}</TooltipContent>
      </Tooltip>
    </div>
  );
}
function EmissionCard({
  title,
  icon: Icon,
  value,
  tone,
  action,
  label,
  disabled,
  busy,
  error,
  emitted,
  test,
  children,
}: {
  title: string;
  icon: LucideIcon;
  value: number;
  tone: "nf" | "receipt" | "boleto";
  action?: () => void;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  error?: string | null;
  emitted?: boolean;
  test?: boolean;
  children: React.ReactNode;
}) {
  const tones = {
    nf: "bg-emission-nf text-emission-contrast hover:bg-emission-nf/90",
    receipt: "bg-primary text-primary-foreground hover:bg-primary/90",
    boleto: "bg-emission-boleto text-emission-contrast hover:bg-emission-boleto/90",
  };
  const badges = {
    nf: "bg-emission-nf/10 text-emission-nf",
    receipt: "bg-primary/10 text-primary",
    boleto: "bg-emission-boleto/10 text-emission-boleto",
  };
  return (
    <article className="min-w-0 rounded-2xl bg-emission-surface p-5 ring-1 ring-border">
      <header className="flex items-center gap-3">
        <span
          className={cn(
            "relative grid size-10 shrink-0 place-items-center rounded-full",
            badges[tone],
          )}
        >
          <Icon className="size-5" />
          {emitted && (
            <Check className="absolute -bottom-1 -right-1 size-4 rounded-full bg-emission-surface" />
          )}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
        {test && (
          <span className="ml-auto rounded-full bg-emission-nf/10 px-2 py-1 text-[10px] font-semibold text-emission-nf">
            Teste
          </span>
        )}
      </header>
      <p className="my-6 font-mono text-2xl font-semibold tabular-nums">{brl(value)}</p>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="block">
            <Button
              disabled={disabled || busy}
              onClick={action}
              className={cn("h-11 w-full rounded-lg text-xs font-semibold", tones[tone])}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Icon />}
              {busy ? "Emitindo…" : label}
            </Button>
          </span>
        </TooltipTrigger>
        {disabled && (
          <TooltipContent>
            {tone === "boleto"
              ? "Nenhum provedor de boleto configurado."
              : "Emissão indisponível para seu acesso."}
          </TooltipContent>
        )}
      </Tooltip>
      {error && (
        <div className="mt-2 flex items-center gap-1">
          <p role="alert" title={error} className="truncate text-xs text-destructive">
            {error}
          </p>
          <Button
            variant="link"
            size="sm"
            onClick={action}
            className="shrink-0 px-1 text-xs text-destructive"
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {children}
    </article>
  );
}
export function RentalEmissions({
  contract,
  competencia,
  canEmit,
  onNf,
}: {
  contract: RentalContractFull;
  competencia: string;
  canEmit: boolean;
  onNf: () => void;
}) {
  const list = useServerFn(listRentalEmissions);
  const register = useServerFn(registerRentalReceipt);
  const taxId = useServerFn(getReceiptCompanyTaxId);
  const signedUrl = useServerFn(getRentalEmissionUrl);
  const qc = useQueryClient();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unfinished = useRef<{
    inputKey: string;
    filePath: string;
    fileName: string;
    valores: Record<string, string | number>;
  } | null>(null);
  const real = useRentalNfse(contract.id, canEmit, false);
  const tests = useRentalNfse(contract.id, canEmit, true);
  const docs = useQuery({
    queryKey: ["rental-emissions", contract.id, competencia],
    queryFn: () => list({ data: { contractId: contract.id, competencia } }),
  });
  const receipt = docs.data?.find((row) => row.tipo === "recibo" && row.status === "emitido");
  const boleto = docs.data?.find((row) => row.tipo === "boleto" && row.status === "emitido");
  const notes = [...real.emissions, ...tests.emissions]
    .filter((row) => row.competencia.slice(0, 7) === competencia)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const nf = notes.find((row) => row.status === "emitida" || row.status === "teste_ok");
  const nfBusy = notes.some((row) => row.status === "processando");
  async function saveReceipt(input: ReceiptInput) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const inputKey = JSON.stringify(input);
      let saved = unfinished.current?.inputKey === inputKey ? unfinished.current : null;
      if (!saved) {
        const model = buildReceiptModel(contract, input);
        const cnpj = await taxId({ data: { brand: input.brand } });
        const response = await fetch(model.company.logo);
        if (!response.ok) throw new Error("Não foi possível carregar o logo.");
        const pdf = await buildReceiptPdf(
          model,
          new Uint8Array(await response.arrayBuffer()),
          cnpj,
        );
        const filePath = `${contract.id}/recibos/${input.competencia}-${Date.now()}-${crypto.randomUUID()}.pdf`;
        const { error: uploadError } = await supabase.storage
          .from("rental-documents")
          .upload(filePath, new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), {
            contentType: "application/pdf",
            upsert: false,
          });
        if (uploadError) throw new Error("Não foi possível guardar o PDF.");
        saved = {
          inputKey,
          filePath,
          fileName: model.fileName,
          valores: { ...input, totalPagar: model.totalPagar, totalReceber: model.totalReceber },
        };
        unfinished.current = saved;
      }
      await register({
        data: {
          contractId: contract.id,
          competencia: input.competencia,
          filePath: saved.filePath,
          fileName: saved.fileName,
          valores: saved.valores,
        },
      });
      unfinished.current = null;
      await qc.invalidateQueries({ queryKey: ["rental-emissions", contract.id] });
      setReceiptOpen(false);
      toast.success("Recibo guardado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível emitir o recibo.");
    } finally {
      setBusy(false);
    }
  }
  async function openFile(id: string) {
    const win = window.open("", "_blank");
    try {
      const url = await signedUrl({ data: { id } });
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch {
      win?.close();
      toast.error("Não foi possível abrir o arquivo.");
    }
  }
  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <EmissionCard
          title="Emitir NF"
          icon={FileCheck2}
          value={contract.comissaoMensal ?? 0}
          tone="nf"
          label="Emitir NF"
          disabled={!canEmit}
          busy={nfBusy}
          action={onNf}
          emitted={Boolean(nf && !nf.modoTeste)}
          test={nf?.modoTeste ?? true}
        >
          <FileSlot
            name={
              nf
                ? nf.modoTeste
                  ? "Nota de teste — sem valor fiscal"
                  : `NFS-e ${nf.numeroNfse ?? ""}${nf.pdfStatus !== "salvo" ? " · PDF pendente" : ""}`
                : null
            }
            date={nf?.createdAt}
            open={
              nf && !nf.modoTeste
                ? () => {
                    if (nf.pdfStatus === "salvo") void real.openPdf(nf.id);
                    else if (nf.linkPdf) window.open(nf.linkPdf, "_blank", "noopener,noreferrer");
                  }
                : undefined
            }
            copy={nf && !nf.modoTeste ? async () => nf.linkPdf ?? nf.numeroNfse ?? "" : undefined}
          />
        </EmissionCard>
        <EmissionCard
          title="Emitir Recibo"
          icon={ReceiptText}
          value={contract.valorMensal}
          tone="receipt"
          label="Emitir Recibo"
          action={() => setReceiptOpen(true)}
          busy={busy}
          error={error}
          emitted={Boolean(receipt)}
        >
          <FileSlot
            name={receipt?.file_name}
            date={receipt?.created_at}
            open={receipt ? () => void openFile(receipt.id) : undefined}
            copy={receipt ? () => signedUrl({ data: { id: receipt.id } }) : undefined}
          />
        </EmissionCard>
        <EmissionCard
          title="Emitir Boleto"
          icon={Barcode}
          value={contract.comissaoMensal ?? 0}
          tone="boleto"
          label="Configurar provedor"
          disabled
          emitted={Boolean(boleto)}
        >
          <FileSlot
            name={boleto?.file_name ?? boleto?.numero}
            date={boleto?.created_at}
            open={boleto ? () => void openFile(boleto.id) : undefined}
            copy={
              boleto
                ? async () => boleto.copy_value ?? (await signedUrl({ data: { id: boleto.id } }))
                : undefined
            }
          />
        </EmissionCard>
      </div>
      {docs.isError && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          Não foi possível carregar os arquivos.
          <Button variant="link" size="sm" onClick={() => void docs.refetch()}>
            Tentar novamente
          </Button>
        </p>
      )}
      {receiptOpen && (
        <ReceiptModal
          key={competencia}
          contract={contract}
          competencia={competencia}
          onClose={() => setReceiptOpen(false)}
          onSave={saveReceipt}
          pending={busy}
          error={error}
        />
      )}
    </TooltipProvider>
  );
}
