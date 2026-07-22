import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-mock";

import {
  Building2,
  CalendarClock,
  FileText,
  Home,
  Paperclip,
  Plus,
  ReceiptText,
  Trash2,
  UploadCloud,
  UserRound,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AgencyId, Corretor, Imovel } from "@/lib/mock/data";
import type {
  SaleDocumentStatus,
  SalePaymentInput,
  SalePaymentMethod,
  SalePropertyType,
  SaleRecord,
  SaleRecordInput,
  SaleStatus,
} from "@/types/sale";

const inputCls =
  "w-full rounded-xl border border-border/70 bg-background px-3.5 py-2.5 text-sm font-semibold text-foreground shadow-sm outline-none transition placeholder:text-foreground/38 hover:border-border focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-55";

const propertyTypes: SalePropertyType[] = [
  "Casa",
  "Apartamento",
  "Sala comercial",
  "Terreno",
  "Sítio",
  "Fazenda",
  "Outro",
];

const paymentMethods: SalePaymentMethod[] = [
  "À vista",
  "Financiamento",
  "Consórcio",
  "Permuta",
  "Parcelado",
  "Outro",
];

const saleStatusOptions: Array<{ id: SaleStatus; label: string }> = [
  { id: "concluida", label: "Concluída" },
  { id: "aguardando_assinatura", label: "Aguardando assinatura" },
  { id: "em_analise", label: "Em análise" },
  { id: "cancelada", label: "Cancelada" },
];

const documentStatusOptions: Array<{ id: SaleDocumentStatus; label: string }> = [
  { id: "contrato_anexado", label: "Contrato anexado" },
  { id: "contrato_pendente", label: "Contrato pendente" },
  { id: "aguardando_assinatura", label: "Aguardando assinatura" },
  { id: "em_analise", label: "Em revisão" },
  { id: "cancelado", label: "Cancelado" },
];

type FileMeta = {
  name: string;
  size?: number;
  type?: string;
};

type Mode = "existing" | "manual";

function Field({
  label,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={`block ${className}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/68">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: typeof Home;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/[0.58] shadow-[0_14px_34px_-28px_rgba(23,27,33,0.28)]">
      <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-primary/75 via-primary/35 to-transparent" />
      <header className="flex items-start justify-between gap-3 border-b border-white/55 bg-white/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[12px] font-black uppercase tracking-[0.12em] text-foreground">
              {title}
            </h3>
            {subtitle && <p className="text-[11px] font-medium text-foreground/52">{subtitle}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function ModeToggle({
  value,
  onChange,
  disableExisting,
}: {
  value: Mode;
  onChange: (mode: Mode) => void;
  disableExisting?: boolean;
}) {
  return (
    <div className="inline-flex w-full max-w-[17rem] rounded-full bg-muted/70 p-1">
      <button
        type="button"
        onClick={() => onChange("existing")}
        disabled={disableExisting}
        aria-pressed={value === "existing"}
        className={
          "flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none " +
          (value === "existing"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-foreground/62 hover:text-foreground")
        }
      >
        Imóvel salvo
      </button>
      <button
        type="button"
        onClick={() => onChange("manual")}
        aria-pressed={value === "manual"}
        className={
          "flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 motion-reduce:transition-none " +
          (value === "manual"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-foreground/62 hover:text-foreground")
        }
      >
        Manual
      </button>
    </div>
  );
}

function parseMoney(value: string) {
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: string) {
  const parsed = parseMoney(value);
  return parsed > 0 ? parsed : undefined;
}

function formatFileSize(size?: number) {
  if (!size) return "arquivo registrado";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isAllowedFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && ["pdf", "doc", "docx", "jpg", "jpeg", "png"].includes(extension));
}

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function buildPaymentsPayload(
  entradaAmount: string,
  entradaDueDate: string,
  parcelas: Array<{ id: string; amount: string; dueDate: string; paid: boolean }>,
): SalePaymentInput[] {
  const list: SalePaymentInput[] = [];
  const entradaVal = parseMoney(entradaAmount);
  if (entradaVal > 0 && entradaDueDate) {
    list.push({ kind: "entrada", sequence: 0, amount: entradaVal, dueDate: entradaDueDate });
  }
  parcelas.forEach((p, idx) => {
    const val = parseMoney(p.amount);
    if (val > 0 && p.dueDate) {
      list.push({
        kind: "parcela",
        sequence: idx,
        amount: val,
        dueDate: p.dueDate,
        paid: p.paid,
      });
    }
  });
  return list;
}

export function SaleForm({
  open,
  onOpenChange,
  properties,
  agents,
  defaultAgency,
  initialRecord,
  onSubmit,
  isSaving = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  properties: Imovel[];
  agents: Corretor[];
  defaultAgency: AgencyId;
  initialRecord?: SaleRecord | null;
  onSubmit: (
    input: SaleRecordInput,
    files: { contract?: File; support?: File },
    id?: string,
  ) => Promise<unknown> | unknown;
  isSaving?: boolean;
}) {
  const session = useSession();
  const contractInputRef = useRef<HTMLInputElement | null>(null);
  const supportInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<Mode>("existing");
  const [agency, setAgency] = useState<AgencyId>(defaultAgency);
  const [propertyId, setPropertyId] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertyNeighborhood, setPropertyNeighborhood] = useState("");
  const [propertyCityState, setPropertyCityState] = useState("");
  const [propertyType, setPropertyType] = useState<SalePropertyType>("Casa");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [previousAskingPrice, setPreviousAskingPrice] = useState("");

  const [buyerName, setBuyerName] = useState("");
  const [buyerDocument, setBuyerDocument] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerObservations, setBuyerObservations] = useState("");

  const [saleValue, setSaleValue] = useState("");
  const [saleDate, setSaleDate] = useState(todayValue());
  const [saleStatus, setSaleStatus] = useState<SaleStatus>("concluida");
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>("Financiamento");
  const [paymentDetails, setPaymentDetails] = useState("");
  const [commissionValue, setCommissionValue] = useState("");
  const [commissionPercentage, setCommissionPercentage] = useState("");
  const [responsibleAgent, setResponsibleAgent] = useState("");
  const [notes, setNotes] = useState("");
  const [entradaAmount, setEntradaAmount] = useState("");
  const [entradaDueDate, setEntradaDueDate] = useState("");
  const [parcelas, setParcelas] = useState<
    Array<{ id: string; amount: string; dueDate: string; paid: boolean }>
  >([]);

  const [documentStatus, setDocumentStatus] = useState<SaleDocumentStatus>("contrato_pendente");
  const [contractFile, setContractFile] = useState<FileMeta | null>(null);
  const [contractFileObj, setContractFileObj] = useState<File | null>(null);
  const [supportingFile, setSupportingFile] = useState<FileMeta | null>(null);
  const [supportingFileObj, setSupportingFileObj] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isEditing = Boolean(initialRecord);
  const title = isEditing ? "Editar venda" : "Cadastrar venda";

  function reset(record?: SaleRecord | null) {
    const nextMode = record?.propertyId ? "existing" : "manual";
    setMode(properties.length === 0 ? "manual" : nextMode);
    setAgency(record?.imobiliaria ?? defaultAgency);
    setPropertyId(record?.propertyId ?? "");
    setPropertyName(record?.propertyName ?? "");
    setPropertyAddress(record?.propertyAddress ?? "");
    setPropertyNeighborhood(record?.propertyNeighborhood ?? "");
    setPropertyCityState(record?.propertyCityState ?? "");
    setPropertyType(record?.propertyType ?? "Casa");
    setBedrooms(record?.bedrooms ? String(record.bedrooms) : "");
    setBathrooms(record?.bathrooms ? String(record.bathrooms) : "");
    setAreaM2(record?.areaM2 ? String(record.areaM2) : "");
    setPreviousAskingPrice(record?.previousAskingPrice ? String(record.previousAskingPrice) : "");
    setBuyerName(record?.buyerName ?? "");
    setBuyerDocument(record?.buyerDocument ?? "");
    setBuyerPhone(record?.buyerPhone ?? "");
    setBuyerEmail(record?.buyerEmail ?? "");
    setBuyerAddress(record?.buyerAddress ?? "");
    setBuyerObservations(record?.buyerObservations ?? "");
    setSaleValue(record?.saleValue ? String(record.saleValue) : "");
    setSaleDate(record?.saleDate ?? todayValue());
    setSaleStatus(record?.saleStatus ?? "concluida");
    setPaymentMethod(record?.paymentMethod ?? "Financiamento");
    setPaymentDetails(record?.paymentDetails ?? "");
    setCommissionValue(record?.commissionValue ? String(record.commissionValue) : "");
    setCommissionPercentage(
      record?.commissionPercentage ? String(record.commissionPercentage) : "",
    );
    setResponsibleAgent(record?.responsibleAgent ?? (record ? "" : (session?.nome ?? "")));

    setNotes(record?.notes ?? "");
    setDocumentStatus(record?.documentStatus ?? "contrato_pendente");
    setContractFile(record?.contractFileName ? { name: record.contractFileName } : null);
    setContractFileObj(null);
    setSupportingFile(
      record?.supportingDocumentFileName ? { name: record.supportingDocumentFileName } : null,
    );
    setSupportingFileObj(null);
    const entrada = record?.payments?.find((p) => p.kind === "entrada");
    const parcelasRec = (record?.payments ?? [])
      .filter((p) => p.kind === "parcela")
      .sort((a, b) => a.sequence - b.sequence);
    setEntradaAmount(entrada ? String(entrada.amount) : "");
    setEntradaDueDate(entrada?.dueDate ?? "");
    setParcelas(
      parcelasRec.map((p) => ({
        id: p.id,
        amount: String(p.amount),
        dueDate: p.dueDate,
        paid: p.paid,
      })),
    );
    setError(null);
    if (contractInputRef.current) contractInputRef.current.value = "";
    if (supportInputRef.current) supportInputRef.current.value = "";
  }

  useEffect(() => {
    if (open) reset(initialRecord);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRecord?.id]);

  function applyProperty(id: string) {
    setPropertyId(id);
    const property = properties.find((item) => item.id === id);
    if (!property) return;
    setAgency(property.imobiliaria);
    setPropertyName(property.titulo);
    setPropertyAddress(property.endereco);
    setPropertyNeighborhood(property.bairro);
    setPropertyCityState(property.cidade);
    setPropertyType(property.tipo);
    setBedrooms(property.quartos ? String(property.quartos) : "");
    setBathrooms(property.banheiros ? String(property.banheiros) : "");
    setAreaM2(property.area ? String(property.area) : "");
    setPreviousAskingPrice(
      property.valorVenda || property.valor ? String(property.valorVenda || property.valor) : "",
    );
  }

  function handleFile(file: File | undefined, kind: "contract" | "support") {
    setError(null);
    if (!file) return;
    if (!isAllowedFile(file)) {
      setError("Use um arquivo PDF, DOC, DOCX, JPG ou PNG.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("O arquivo deve ter no máximo 10 MB.");
      return;
    }
    const meta = { name: file.name, size: file.size, type: file.type };
    if (kind === "contract") {
      setContractFile(meta);
      setContractFileObj(file);
      if (documentStatus === "contrato_pendente") setDocumentStatus("contrato_anexado");
    } else {
      setSupportingFile(meta);
      setSupportingFileObj(file);
    }
  }

  function removeContractFile() {
    setContractFile(null);
    setContractFileObj(null);
    if (contractInputRef.current) contractInputRef.current.value = "";
    if (documentStatus === "contrato_anexado") setDocumentStatus("contrato_pendente");
  }

  function removeSupportingFile() {
    setSupportingFile(null);
    setSupportingFileObj(null);
    if (supportInputRef.current) supportInputRef.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedSaleValue = parseMoney(saleValue);
    const trimmedPropertyName = propertyName.trim();
    const trimmedBuyerName = buyerName.trim();
    const trimmedEmail = buyerEmail.trim();

    if (mode === "existing" && !propertyId) {
      setError("Selecione o imóvel vendido ou use o cadastro manual.");
      return;
    }
    if (!trimmedPropertyName) {
      setError("Informe o imóvel vendido.");
      return;
    }
    if (!trimmedBuyerName) {
      setError("Informe o nome completo do comprador.");
      return;
    }
    if (!parsedSaleValue || parsedSaleValue <= 0) {
      setError("Informe um valor vendido maior que zero.");
      return;
    }
    if (!saleDate) {
      setError("Informe a data da venda.");
      return;
    }
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("Informe um e-mail válido para o comprador.");
      return;
    }
    if (documentStatus === "contrato_anexado" && !contractFile?.name) {
      setError("Anexe o contrato ou ajuste o status documental para pendente.");
      return;
    }

    const input: SaleRecordInput = {
      imobiliaria: agency,
      propertyId: mode === "existing" ? propertyId : undefined,
      propertyName: trimmedPropertyName,
      propertyAddress: propertyAddress.trim() || "Endereço não informado",
      propertyNeighborhood: propertyNeighborhood.trim() || undefined,
      propertyCityState: propertyCityState.trim() || undefined,
      propertyType,
      bedrooms: optionalNumber(bedrooms),
      bathrooms: optionalNumber(bathrooms),
      areaM2: optionalNumber(areaM2),
      previousAskingPrice: optionalNumber(previousAskingPrice),
      buyerName: trimmedBuyerName,
      buyerDocument: buyerDocument.trim() || undefined,
      buyerPhone: buyerPhone.trim() || undefined,
      buyerEmail: trimmedEmail || undefined,
      buyerAddress: buyerAddress.trim() || undefined,
      buyerObservations: buyerObservations.trim() || undefined,
      saleValue: parsedSaleValue,
      saleDate,
      saleStatus,
      paymentMethod,
      paymentDetails: paymentDetails.trim() || undefined,
      commissionValue: optionalNumber(commissionValue),
      commissionPercentage: optionalNumber(commissionPercentage),
      responsibleAgent: responsibleAgent.trim() || undefined,
      contractFilePath: contractFile?.name ? initialRecord?.contractFilePath : undefined,
      contractFileName: contractFile?.name,
      supportingDocumentFileName: supportingFile?.name,
      documentStatus: saleStatus === "cancelada" ? "cancelado" : documentStatus,
      notes: notes.trim() || undefined,
      payments: buildPaymentsPayload(entradaAmount, entradaDueDate, parcelas),
    };

    try {
      await onSubmit(
        input,
        { contract: contractFileObj ?? undefined, support: supportingFileObj ?? undefined },
        initialRecord?.id,
      );
      reset(null);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar a venda.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-dvh w-full max-w-full flex-col overflow-hidden border-white/40 bg-[#f7f3ed]/96 p-0 text-foreground backdrop-blur-2xl sm:max-w-3xl [&>button]:hidden"
      >
        <SheetHeader className="sticky top-0 z-10 space-y-0 border-b border-white/60 bg-[#f7f3ed]/92 px-5 py-4 text-left backdrop-blur-xl sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <ReceiptText className="size-5" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="text-xl font-black tracking-tight sm:text-2xl">
                  {title}
                </SheetTitle>
                <SheetDescription className="text-sm font-medium text-foreground/56">
                  Registre comprador, imóvel vendido, valores, pagamento e contrato.
                </SheetDescription>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white/60 text-foreground/60 ring-1 ring-white/70 transition hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label="Fechar cadastro de venda"
            >
              <X className="size-4" />
            </button>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
            <SectionCard
              icon={ReceiptText}
              title="Informações da venda"
              subtitle="Valor final, data, pagamento e responsável"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                <Field label="Valor vendido" className="sm:col-span-2">
                  <input
                    value={saleValue}
                    onChange={(event) => setSaleValue(event.target.value)}
                    inputMode="decimal"
                    placeholder="Ex.: 430000"
                    className={inputCls}
                    required
                  />
                </Field>
                <Field label="Data da venda" className="sm:col-span-2">
                  <input
                    type="date"
                    value={saleDate}
                    onChange={(event) => setSaleDate(event.target.value)}
                    className={inputCls}
                    required
                  />
                </Field>
                <Field label="Imobiliária" className="sm:col-span-2">
                  <select
                    value={agency}
                    onChange={(event) => setAgency(event.target.value as AgencyId)}
                    className={inputCls}
                  >
                    <option value="cordial">Cordial</option>
                    <option value="morar">Morar</option>
                  </select>
                </Field>
                <Field label="Status da venda" className="sm:col-span-3">
                  <select
                    value={saleStatus}
                    onChange={(event) => setSaleStatus(event.target.value as SaleStatus)}
                    className={inputCls}
                  >
                    {saleStatusOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Forma de pagamento" className="sm:col-span-3">
                  <select
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value as SalePaymentMethod)}
                    className={inputCls}
                  >
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Comissão (R$)" className="sm:col-span-2">
                  <input
                    value={commissionValue}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setCommissionValue(raw);
                      const total = parseMoney(saleValue);
                      const val = parseMoney(raw);
                      if (total > 0 && val > 0) {
                        const pct = (val / total) * 100;
                        setCommissionPercentage(pct.toFixed(2).replace(/\.?0+$/, ""));
                      } else if (!raw) {
                        setCommissionPercentage("");
                      }
                    }}
                    inputMode="decimal"
                    placeholder="Ex.: 24000"
                    className={inputCls}
                  />
                </Field>
                <Field label="Comissão (%)" className="sm:col-span-2">
                  <input
                    value={commissionPercentage}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setCommissionPercentage(raw);
                      const total = parseMoney(saleValue);
                      const pct = parseMoney(raw);
                      if (total > 0 && pct > 0) {
                        const val = (total * pct) / 100;
                        setCommissionValue(val.toFixed(2).replace(/\.?0+$/, ""));
                      } else if (!raw) {
                        setCommissionValue("");
                      }
                    }}
                    inputMode="decimal"
                    placeholder="Ex.: 5"
                    className={inputCls}
                  />
                </Field>
                <Field label="Responsável" className="sm:col-span-2">
                  <select
                    value={responsibleAgent}
                    onChange={(event) => setResponsibleAgent(event.target.value)}
                    className={inputCls}
                  >
                    <option value="">Selecionar</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.nome}>
                        {agent.nome}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Detalhes do pagamento" className="sm:col-span-6">
                  <textarea
                    rows={3}
                    value={paymentDetails}
                    onChange={(event) => setPaymentDetails(event.target.value)}
                    placeholder="Ex.: entrada, financiamento, parcelas, banco, prazo de repasse..."
                    className={`${inputCls} resize-none`}
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard
              icon={CalendarClock}
              title="Plano de pagamento"
              subtitle="Entrada e parcelas com data de vencimento (lembretes automáticos)"
            >
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
                  <Field label="Entrada (R$)" className="sm:col-span-3">
                    <input
                      value={entradaAmount}
                      onChange={(event) => setEntradaAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder="Ex.: 240000"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Vencimento da entrada" className="sm:col-span-3">
                    <input
                      type="date"
                      value={entradaDueDate}
                      onChange={(event) => setEntradaDueDate(event.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </div>

                <div className="space-y-2">
                  {parcelas.length === 0 && (
                    <p className="rounded-2xl bg-white/50 px-3 py-3 text-xs font-semibold text-foreground/56 ring-1 ring-white/70">
                      Nenhuma parcela cadastrada. Adicione parcelas para receber lembrete no dia do vencimento (in-app e por e-mail).
                    </p>
                  )}
                  {parcelas.map((p, idx) => (
                    <div
                      key={p.id}
                      className="grid grid-cols-1 gap-2 rounded-2xl border border-white/60 bg-white/60 p-3 sm:grid-cols-[auto_1fr_1fr_auto] sm:items-end"
                    >
                      <div className="grid size-8 place-items-center rounded-lg bg-primary/10 text-xs font-black text-primary">
                        {idx + 1}
                      </div>
                      <Field label={`Parcela ${idx + 1} (R$)`}>
                        <input
                          value={p.amount}
                          onChange={(event) => {
                            const val = event.target.value;
                            setParcelas((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, amount: val } : it)),
                            );
                          }}
                          inputMode="decimal"
                          placeholder="Ex.: 20000"
                          className={inputCls}
                        />
                      </Field>
                      <Field label="Vencimento">
                        <input
                          type="date"
                          value={p.dueDate}
                          onChange={(event) => {
                            const val = event.target.value;
                            setParcelas((prev) =>
                              prev.map((it, i) => (i === idx ? { ...it, dueDate: val } : it)),
                            );
                          }}
                          className={inputCls}
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() =>
                          setParcelas((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label={`Remover parcela ${idx + 1}`}
                        className="grid size-10 place-items-center rounded-xl bg-white/70 text-foreground/55 ring-1 ring-white/70 transition hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      setParcelas((prev) => [
                        ...prev,
                        {
                          id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                          amount: "",
                          dueDate: "",
                          paid: false,
                        },
                      ])
                    }
                    className="inline-flex h-10 items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 text-sm font-bold text-primary transition hover:bg-primary/15"
                  >
                    <Plus className="size-4" />
                    Adicionar parcela
                  </button>
                </div>

                <PaymentPlanSummary
                  saleValue={parseMoney(saleValue)}
                  entrada={parseMoney(entradaAmount)}
                  parcelas={parcelas.map((p) => parseMoney(p.amount))}
                />
              </div>
            </SectionCard>

            <SectionCard
              icon={UserRound}
              title="Comprador"
              subtitle="Dados de contato e identificação"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                <Field label="Nome completo" className="sm:col-span-4">
                  <input
                    value={buyerName}
                    onChange={(event) => setBuyerName(event.target.value)}
                    placeholder="Nome do comprador"
                    className={inputCls}
                    required
                  />
                </Field>
                <Field label="CPF/CNPJ" className="sm:col-span-2">
                  <input
                    value={buyerDocument}
                    onChange={(event) => setBuyerDocument(event.target.value)}
                    placeholder="Opcional"
                    className={inputCls}
                  />
                </Field>
                <Field label="Telefone / WhatsApp" className="sm:col-span-3">
                  <input
                    value={buyerPhone}
                    onChange={(event) => setBuyerPhone(event.target.value)}
                    placeholder="(00) 00000-0000"
                    className={inputCls}
                  />
                </Field>
                <Field label="E-mail" className="sm:col-span-3">
                  <input
                    type="email"
                    value={buyerEmail}
                    onChange={(event) => setBuyerEmail(event.target.value)}
                    placeholder="comprador@email.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="Endereço" className="sm:col-span-6">
                  <input
                    value={buyerAddress}
                    onChange={(event) => setBuyerAddress(event.target.value)}
                    placeholder="Endereço do comprador, se relevante"
                    className={inputCls}
                  />
                </Field>
                <Field label="Observações do comprador" className="sm:col-span-6">
                  <textarea
                    rows={3}
                    value={buyerObservations}
                    onChange={(event) => setBuyerObservations(event.target.value)}
                    placeholder="Preferências de contato, dados complementares ou observações úteis."
                    className={`${inputCls} resize-none`}
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard
              icon={Building2}
              title="Imóvel vendido"
              subtitle="Selecione um imóvel salvo ou registre uma referência manual"
              action={
                <ModeToggle
                  value={mode}
                  onChange={(nextMode) => {
                    setMode(nextMode);
                    if (nextMode === "manual") setPropertyId("");
                  }}
                  disableExisting={properties.length === 0}
                />
              }
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                {mode === "existing" && (
                  <Field label="Selecionar imóvel" className="sm:col-span-6">
                    <select
                      value={propertyId}
                      onChange={(event) => applyProperty(event.target.value)}
                      className={inputCls}
                      required={mode === "existing"}
                    >
                      <option value="">Selecione o imóvel vendido</option>
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.titulo} · {property.bairro} · {property.cidade}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="Nome ou referência" className="sm:col-span-4">
                  <input
                    value={propertyName}
                    onChange={(event) => setPropertyName(event.target.value)}
                    placeholder="Ex.: Apartamento Cruzeiro Vista"
                    className={inputCls}
                    required
                  />
                </Field>
                <Field label="Tipo" className="sm:col-span-2">
                  <select
                    value={propertyType}
                    onChange={(event) => setPropertyType(event.target.value as SalePropertyType)}
                    className={inputCls}
                  >
                    {propertyTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Endereço completo" className="sm:col-span-6">
                  <input
                    value={propertyAddress}
                    onChange={(event) => setPropertyAddress(event.target.value)}
                    placeholder="Rua, número, complemento"
                    className={inputCls}
                  />
                </Field>
                <Field label="Bairro" className="sm:col-span-3">
                  <input
                    value={propertyNeighborhood}
                    onChange={(event) => setPropertyNeighborhood(event.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field label="Cidade/UF" className="sm:col-span-3">
                  <input
                    value={propertyCityState}
                    onChange={(event) => setPropertyCityState(event.target.value)}
                    placeholder="Ex.: Santa Rosa/RS"
                    className={inputCls}
                  />
                </Field>
                <Field label="Quartos" className="sm:col-span-2">
                  <input
                    value={bedrooms}
                    onChange={(event) => setBedrooms(event.target.value)}
                    inputMode="numeric"
                    className={inputCls}
                  />
                </Field>
                <Field label="Banheiros" className="sm:col-span-2">
                  <input
                    value={bathrooms}
                    onChange={(event) => setBathrooms(event.target.value)}
                    inputMode="numeric"
                    className={inputCls}
                  />
                </Field>
                <Field label="Área (m²)" className="sm:col-span-2">
                  <input
                    value={areaM2}
                    onChange={(event) => setAreaM2(event.target.value)}
                    inputMode="decimal"
                    className={inputCls}
                  />
                </Field>
                <Field label="Valor pedido anterior" className="sm:col-span-3">
                  <input
                    value={previousAskingPrice}
                    onChange={(event) => setPreviousAskingPrice(event.target.value)}
                    inputMode="decimal"
                    placeholder="Opcional"
                    className={inputCls}
                  />
                </Field>
              </div>
            </SectionCard>

            <SectionCard
              icon={FileText}
              title="Documentos"
              subtitle="Contrato e arquivos de apoio da venda"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
                <Field label="Status documental" className="sm:col-span-6">
                  <select
                    value={documentStatus}
                    onChange={(event) =>
                      setDocumentStatus(event.target.value as SaleDocumentStatus)
                    }
                    className={inputCls}
                  >
                    {documentStatusOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <FileDrop
                  label="Contrato de venda"
                  helper="PDF, DOC, DOCX, JPG ou PNG até 10 MB"
                  file={contractFile}
                  inputRef={contractInputRef}
                  onChange={(file) => handleFile(file, "contract")}
                  onRemove={removeContractFile}
                  className="sm:col-span-3"
                />
                <FileDrop
                  label="Documentos auxiliares"
                  helper="Opcional: certidões, recibos ou anexos"
                  file={supportingFile}
                  inputRef={supportInputRef}
                  onChange={(file) => handleFile(file, "support")}
                  onRemove={removeSupportingFile}
                  className="sm:col-span-3"
                />
                <Field label="Observações internas" className="sm:col-span-6">
                  <textarea
                    rows={4}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Condições especiais, pendências, combinação com comprador ou observações do contrato."
                    className={`${inputCls} resize-none`}
                  />
                </Field>
              </div>
            </SectionCard>

            {error && (
              <div
                role="alert"
                className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-700"
              >
                {error}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 z-10 flex flex-col-reverse gap-2 border-t border-white/60 bg-[#f7f3ed]/92 px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-end sm:px-7">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-11 rounded-2xl border border-white/70 bg-white/62 px-5 text-sm font-bold text-foreground/72 transition hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ReceiptText className="size-4" />
              {isSaving ? "Salvando..." : isEditing ? "Salvar venda" : "Cadastrar venda"}
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function FileDrop({
  label,
  helper,
  file,
  inputRef,
  onChange,
  onRemove,
  className,
}: {
  label: string;
  helper: string;
  file: FileMeta | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (file?: File) => void;
  onRemove: () => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/68">{label}</p>
      <div className="mt-1.5 rounded-2xl border border-dashed border-primary/25 bg-primary/[0.035] p-3">
        {file ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-2 text-sm font-bold text-foreground">
                <Paperclip className="size-4 shrink-0 text-primary" />
                <span className="truncate">{file.name}</span>
              </p>
              <p className="mt-1 text-xs font-medium text-foreground/50">
                {formatFileSize(file.size)} · pronto para salvar
              </p>
            </div>
            <button
              type="button"
              onClick={onRemove}
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/70 text-foreground/55 ring-1 ring-white/70 transition hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              aria-label={`Remover ${label.toLowerCase()}`}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl bg-white/55 px-3 py-5 text-center ring-1 ring-white/70 transition hover:bg-white">
            <UploadCloud className="size-6 text-primary" />
            <span className="mt-2 text-sm font-bold text-foreground">Anexar arquivo</span>
            <span className="mt-1 text-xs font-medium text-foreground/50">{helper}</span>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(event) => onChange(event.target.files?.[0])}
            />
          </label>
        )}
      </div>
    </div>
  );
}
