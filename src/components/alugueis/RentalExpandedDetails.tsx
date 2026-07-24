import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Home,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { brl } from "@/lib/format";
import { formatRentalDate, hasRentalOwnerData } from "@/lib/rentals/rental-detail.utils";
import { cn } from "@/lib/utils";
import type {
  RentalContractFull,
  RentalContractGuaranteeItem,
  RentalContractStatus,
  RentalPaymentStatus,
  RentalPropertyType,
  RentalTenant,
} from "@/types/rental";
import { RentalDocuments } from "./RentalDocuments";
import { RentalPaymentBadge, RentalStatusBadge } from "./RentalStatusBadge";

type DetailSection = "resumo" | "contrato" | "locatarios" | "garantias" | "imovel" | "documentos";

type PendingAction = "paid" | "renew" | "close" | "delete" | null;

const SECTION_NAVIGATION: {
  id: DetailSection;
  label: string;
  icon: LucideIcon;
}[] = [
  { id: "resumo", label: "Resumo", icon: Home },
  { id: "contrato", label: "Contrato", icon: FileText },
  { id: "locatarios", label: "Locatários", icon: UsersRound },
  { id: "garantias", label: "Garantias", icon: ShieldCheck },
  { id: "imovel", label: "Imóvel e proprietário", icon: Building2 },
  { id: "documentos", label: "Documentos", icon: WalletCards },
];

const CONTRACT_STATUS_LABELS: Record<RentalContractStatus, string> = {
  ativo: "Ativo",
  pendente_assinatura: "Pendente de assinatura",
  vencido: "Vencido",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
};

const PAYMENT_STATUS_LABELS: Record<RentalPaymentStatus, string> = {
  em_dia: "Em dia",
  vence_hoje: "Vence hoje",
  atrasado: "Em atraso",
  pago: "Pago",
  pendente: "Pendente",
};

const PROPERTY_TYPE_LABELS: Record<RentalPropertyType, string> = {
  casa: "Casa",
  apartamento: "Apartamento",
  sala_comercial: "Sala comercial",
  terreno: "Terreno",
  kitnet: "Kitnet",
  outro: "Outro",
};

function BrandBadge({ brand }: { brand?: string | null }) {
  const normalized = brand === "morar" ? "morar" : "cordial";
  const label = normalized === "morar" ? "Morar Imóveis" : "Cordial Imóveis";
  const className =
    normalized === "morar"
      ? "bg-[color:var(--morar-primary,#8b5cf6)]/10 text-[color:var(--morar-primary,#8b5cf6)] ring-[color:var(--morar-primary,#8b5cf6)]/25"
      : "bg-[color:var(--cordial-primary,#0ea5e9)]/10 text-[color:var(--cordial-primary,#0ea5e9)] ring-[color:var(--cordial-primary,#0ea5e9)]/25";

  return (
    <span
      className={cn(
        "inline-flex min-h-6 items-center rounded-full px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] ring-1",
        className,
      )}
    >
      {label}
    </span>
  );
}

function displayValue(value: ReactNode): ReactNode {
  if (value === null || value === undefined || value === "") return "Não informado";
  return value;
}

function DetailField({
  label,
  value,
  emphasis = false,
  className,
}: {
  label: string;
  value: ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-semibold leading-4 text-foreground/56">{label}</dt>
      <dd
        className={cn(
          "mt-1 min-w-0 break-words text-[13px] leading-5 text-foreground [overflow-wrap:anywhere]",
          emphasis && "font-bold text-foreground",
        )}
      >
        {displayValue(value)}
      </dd>
    </div>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border px-3.5 py-3",
        accent ? "border-primary/18 bg-primary/[0.07]" : "border-foreground/[0.07] bg-white/55",
      )}
    >
      <div className="flex items-center gap-2 text-foreground/58">
        <Icon className={cn("size-3.5 shrink-0", accent && "text-primary")} />
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.08em]">{label}</span>
      </div>
      <p
        className={cn(
          "mt-2 min-w-0 break-words text-[13px] font-bold leading-5 [overflow-wrap:anywhere]",
          accent && "text-primary",
        )}
      >
        {displayValue(value)}
      </p>
    </div>
  );
}

function SectionSurface({
  id,
  sectionKey,
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  id: string;
  sectionKey: DetailSection;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      data-rental-section={sectionKey}
      className={cn(
        "scroll-mt-16 rounded-[1.35rem] border border-foreground/[0.07] bg-white/58 p-4 shadow-[0_18px_42px_-34px_rgba(22,56,70,0.4)] sm:p-5",
        className,
      )}
      aria-labelledby={`${id}-title`}
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/9 text-primary ring-1 ring-primary/10">
          <Icon className="size-4.5" />
        </span>
        <div className="min-w-0">
          <h3
            id={`${id}-title`}
            className="text-[15px] font-extrabold leading-5 tracking-[-0.015em] text-foreground"
          >
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[11px] leading-4 text-foreground/55">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyDetail({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-foreground/12 bg-background/35 px-3.5 py-3 text-xs font-medium leading-5 text-foreground/55">
      {children}
    </p>
  );
}

function TenantDetails({ tenant, index }: { tenant: RentalTenant; index: number }) {
  return (
    <article
      className={cn("py-4 first:pt-0 last:pb-0", index > 0 && "border-t border-foreground/[0.07]")}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/9 text-primary">
            <UserRound className="size-4" />
          </span>
          <h4 className="min-w-0 break-words text-sm font-bold leading-5 [overflow-wrap:anywhere]">
            {tenant.nome}
          </h4>
        </div>
        <span className="rounded-full bg-foreground/[0.06] px-2 py-1 text-[10px] font-bold text-foreground/60">
          {index === 0 ? "Principal" : `Adicional ${index}`}
        </span>
      </div>
      <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
        <DetailField label="CPF/CNPJ" value={tenant.cpfCnpj} />
        <DetailField label="Telefone" value={tenant.telefone} />
        <DetailField label="E-mail" value={tenant.email} />
        <DetailField label="Profissão" value={tenant.profissao} />
        <DetailField
          label="Renda aproximada"
          value={tenant.rendaAproximada ? brl(tenant.rendaAproximada) : null}
        />
        <DetailField label="Endereço atual" value={tenant.endereco} />
      </dl>
    </article>
  );
}

function guaranteeLabel(guarantee: RentalContractGuaranteeItem) {
  if (guarantee.tipo === "fiador") return "Fiador";
  if (guarantee.tipo === "caucao") return "Caução";
  return "Seguro fiança";
}

function GuaranteeDetails({
  guarantee,
  index,
}: {
  guarantee: RentalContractGuaranteeItem;
  index: number;
}) {
  return (
    <article
      className={cn("py-4 first:pt-0 last:pb-0", index > 0 && "border-t border-foreground/[0.07]")}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-700">
            <ShieldCheck className="size-4" />
          </span>
          <h4 className="text-sm font-bold">{guaranteeLabel(guarantee)}</h4>
        </div>
        {guarantee.isPrimary && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700">
            Principal
          </span>
        )}
      </div>

      {guarantee.tipo === "fiador" && guarantee.guarantor ? (
        <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
          <DetailField label="Nome do fiador" value={guarantee.guarantor.nome} emphasis />
          <DetailField label="CPF/CNPJ" value={guarantee.guarantor.cpfCnpj} />
          <DetailField label="Telefone" value={guarantee.guarantor.telefone} />
          <DetailField label="E-mail" value={guarantee.guarantor.email} />
          <DetailField label="Vínculo" value={guarantee.guarantor.vinculo} />
          <DetailField label="Endereço" value={guarantee.guarantor.endereco} />
        </dl>
      ) : guarantee.tipo === "fiador" ? (
        <EmptyDetail>O fiador vinculado não está disponível para consulta.</EmptyDetail>
      ) : guarantee.tipo === "caucao" ? (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <DetailField
            label="Valor da caução"
            value={guarantee.valorCaucao ? brl(guarantee.valorCaucao) : null}
            emphasis
          />
        </dl>
      ) : (
        <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
          <DetailField label="Seguradora" value={guarantee.seguroSeguradora} emphasis />
          <DetailField label="Nº da apólice" value={guarantee.seguroApolice} />
          <DetailField
            label="Valor mensal"
            value={guarantee.seguroValorMensal ? brl(guarantee.seguroValorMensal) : null}
          />
        </dl>
      )}
    </article>
  );
}

function ActionButton({
  icon: Icon,
  children,
  onClick,
  disabled,
  variant = "neutral",
  className,
}: {
  icon: LucideIcon;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "primary" | "success" | "neutral" | "warning" | "danger";
  className?: string;
}) {
  const variants = {
    primary: "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110",
    success:
      "bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/18 hover:bg-emerald-500/15",
    neutral: "bg-white/72 text-foreground ring-1 ring-foreground/8 hover:bg-white",
    warning: "bg-amber-500/[0.08] text-amber-800 ring-1 ring-amber-500/16 hover:bg-amber-500/13",
    danger: "bg-transparent text-rose-700 ring-1 ring-rose-500/20 hover:bg-rose-500/[0.08]",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 text-xs font-bold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:pointer-events-none disabled:opacity-55 motion-reduce:transition-none",
        variants[variant],
        className,
      )}
    >
      <Icon className="size-4 shrink-0" />
      {children}
    </button>
  );
}

export function RentalExpandedDetails({
  contract,
  open,
  onOpenChange,
  onClose,
  onRenew,
  onMarkPaid,
  onDelete,
  onEdit,
}: {
  contract: RentalContractFull | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: (id: string) => void | Promise<unknown>;
  onRenew: (id: string) => void | Promise<unknown>;
  onMarkPaid: (id: string) => void | Promise<unknown>;
  onDelete: (id: string) => void | Promise<unknown>;
  onEdit?: (contract: RentalContractFull) => void;
}) {
  const [activeSection, setActiveSection] = useState<DetailSection>("resumo");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contractId = contract?.id ?? null;

  const tenants = useMemo(
    () => (contract ? (contract.tenants?.length ? contract.tenants : [contract.tenant]) : []),
    [contract],
  );
  const guarantees = useMemo(
    () => (contract?.guarantees?.length ? contract.guarantees : []),
    [contract],
  );

  useEffect(() => {
    if (!open || !contractId) return;
    setActiveSection("resumo");
    setPendingAction(null);
    scrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [contractId, open]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!open || !contractId || !root || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const section = visible?.target.getAttribute("data-rental-section") as DetailSection | null;
        if (section) setActiveSection(section);
      },
      {
        root,
        rootMargin: "-12% 0px -72% 0px",
        threshold: [0, 0.08, 0.2],
      },
    );

    const nodes = root.querySelectorAll<HTMLElement>("[data-rental-section]");
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [contractId, open]);

  if (!contract) return null;
  const rentalId = contract.id;

  const sectionId = (section: DetailSection) => `rental-detail-${rentalId}-${section}`;
  const address = [
    contract.property.logradouro,
    contract.property.numero,
    contract.property.complemento,
  ]
    .filter(Boolean)
    .join(", ");
  const city = [contract.property.bairro, contract.property.cidade, contract.property.uf]
    .filter(Boolean)
    .join(" · ");
  const phone = (contract.tenant.telefone ?? "").replace(/\D/g, "");
  const waUrl = phone ? `https://wa.me/55${phone}` : null;
  const mailUrl = contract.tenant.email ? `mailto:${contract.tenant.email}` : null;
  const hasOwner = hasRentalOwnerData(contract.property);

  function navigateTo(section: DetailSection) {
    const root = scrollRef.current;
    const target = document.getElementById(sectionId(section));
    if (!root || !target) return;

    setActiveSection(section);
    const rootRect = root.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = root.scrollTop + targetRect.top - rootRect.top - 58;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    root.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  }

  async function runAction(
    action: Exclude<PendingAction, null>,
    handler: (id: string) => void | Promise<unknown>,
  ) {
    if (pendingAction) return;
    setPendingAction(action);
    try {
      await handler(rentalId);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        closeLabel="Fechar detalhes do aluguel"
        className={cn(
          "flex h-dvh w-full max-w-full flex-col gap-0 overflow-hidden border-l border-white/55 bg-[#f7f3ed]/98 p-0 text-foreground shadow-2xl backdrop-blur-2xl",
          "sm:w-[min(96vw,1120px)] sm:max-w-none 2xl:w-[min(86vw,1240px)]",
          "data-[state=closed]:duration-200 data-[state=open]:duration-200",
          "motion-reduce:data-[state=closed]:animate-none motion-reduce:data-[state=open]:animate-none",
          "[&>button]:hidden",
        )}
      >
        <SheetHeader className="shrink-0 border-b border-foreground/[0.07] bg-white/58 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-left sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 sm:size-12">
                <Building2 className="size-5 sm:size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <BrandBadge brand={contract.brand} />
                  <RentalStatusBadge status={contract.status} />
                  <RentalPaymentBadge status={contract.paymentStatus} />
                </div>
                <SheetTitle className="mt-2 max-w-3xl break-words pr-1 text-lg font-black leading-6 tracking-[-0.025em] sm:text-2xl sm:leading-7 [overflow-wrap:anywhere]">
                  {contract.property.apelido}
                </SheetTitle>
                <SheetDescription className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium leading-5 text-foreground/58 sm:text-sm">
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <UserRound className="size-3.5 shrink-0" />
                    <span className="break-words [overflow-wrap:anywhere]">
                      {contract.tenant.nome}
                    </span>
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    {tenants.length} locatário{tenants.length === 1 ? "" : "s"}
                  </span>
                </SheetDescription>
              </div>
            </div>

            <div className="flex shrink-0 items-start gap-2">
              <div className="hidden min-w-32 rounded-2xl bg-primary/[0.07] px-4 py-2.5 text-right ring-1 ring-primary/10 sm:block">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground/50">
                  Aluguel mensal
                </p>
                <p className="mt-0.5 font-mono text-lg font-black tabular-nums text-primary">
                  {brl(contract.valorMensal)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-white/72 text-foreground/62 ring-1 ring-foreground/[0.08] transition duration-200 hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transition-none"
                aria-label="Fechar detalhes do aluguel"
              >
                <X className="size-4.5" />
              </button>
            </div>
          </div>
        </SheetHeader>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-testid="rental-detail-scroll"
        >
          <nav
            aria-label="Seções dos detalhes do aluguel"
            className="sticky top-0 z-20 border-b border-foreground/[0.07] bg-[#f7f3ed]/94 px-4 py-2.5 backdrop-blur-xl sm:px-6 lg:px-8"
          >
            <div className="no-scrollbar flex min-w-0 gap-1 overflow-x-auto">
              {SECTION_NAVIGATION.map(({ id, label, icon: Icon }) => {
                const active = activeSection === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => navigateTo(id)}
                    aria-current={active ? "location" : undefined}
                    className={cn(
                      "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-bold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 motion-reduce:transition-none",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground/58 hover:bg-white/70 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="space-y-4 px-4 py-4 pb-8 sm:px-6 sm:py-5 lg:px-8">
            <section
              id={sectionId("resumo")}
              data-rental-section="resumo"
              className="scroll-mt-16"
              aria-labelledby={`${sectionId("resumo")}-title`}
            >
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary/75">
                    Visão geral
                  </p>
                  <h3
                    id={`${sectionId("resumo")}-title`}
                    className="mt-1 text-lg font-black tracking-[-0.025em]"
                  >
                    Informações essenciais
                  </h3>
                </div>
                <p className="hidden text-[11px] font-medium text-foreground/48 sm:block">
                  Atualizado com os dados do contrato
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                <SummaryItem
                  icon={CircleDollarSign}
                  label="Valor mensal"
                  value={brl(contract.valorMensal)}
                  accent
                />
                <SummaryItem
                  icon={CalendarDays}
                  label="Início"
                  value={formatRentalDate(contract.dataInicio)}
                />
                <SummaryItem
                  icon={CalendarDays}
                  label="Fim"
                  value={formatRentalDate(contract.dataFim)}
                />
                <SummaryItem
                  icon={WalletCards}
                  label="Vencimento"
                  value={`Dia ${contract.diaVencimento}`}
                />
                <SummaryItem
                  icon={CalendarDays}
                  label="Próximo vencimento"
                  value={formatRentalDate(contract.proximoVencimento)}
                />
                <SummaryItem icon={MapPin} label="Imóvel" value={contract.property.apelido} />
                <SummaryItem
                  icon={UserRound}
                  label="Locatário principal"
                  value={contract.tenant.nome}
                />
                <SummaryItem
                  icon={Building2}
                  label="Proprietário"
                  value={contract.property.proprietarioNome}
                />
              </div>
            </section>

            <div className="grid items-start gap-4 xl:grid-cols-12">
              <SectionSurface
                id={sectionId("contrato")}
                sectionKey="contrato"
                icon={FileText}
                title="Contrato e pagamento"
                description="Vigência, cobrança e condições registradas."
                className="xl:col-span-5"
              >
                <dl className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                  <DetailField label="Valor mensal" value={brl(contract.valorMensal)} emphasis />
                  <DetailField label="Dia de vencimento" value={`Dia ${contract.diaVencimento}`} />
                  <DetailField
                    label="Início do contrato"
                    value={formatRentalDate(contract.dataInicio)}
                  />
                  <DetailField label="Fim do contrato" value={formatRentalDate(contract.dataFim)} />
                  <DetailField
                    label="Próximo vencimento"
                    value={formatRentalDate(contract.proximoVencimento)}
                  />
                  <DetailField
                    label="Situação"
                    value={`${CONTRACT_STATUS_LABELS[contract.status]} · ${
                      PAYMENT_STATUS_LABELS[contract.paymentStatus]
                    }`}
                  />
                  {contract.dataEncerramento && (
                    <DetailField
                      label="Encerrado em"
                      value={formatRentalDate(contract.dataEncerramento)}
                    />
                  )}
                  <DetailField
                    label="Observações"
                    value={contract.observacoes}
                    className="sm:col-span-2"
                  />
                </dl>
              </SectionSurface>

              <SectionSurface
                id={sectionId("locatarios")}
                sectionKey="locatarios"
                icon={UsersRound}
                title={`Locatários${tenants.length > 1 ? ` (${tenants.length})` : ""}`}
                description="Pessoas responsáveis por este contrato."
                className="xl:col-span-7"
              >
                <div>
                  {tenants.map((tenant, index) => (
                    <TenantDetails key={tenant.id} tenant={tenant} index={index} />
                  ))}
                </div>
              </SectionSurface>

              <SectionSurface
                id={sectionId("garantias")}
                sectionKey="garantias"
                icon={ShieldCheck}
                title={`Garantias${guarantees.length > 1 ? ` (${guarantees.length})` : ""}`}
                description="Modalidades e responsáveis vinculados à locação."
                className="xl:col-span-5"
              >
                {guarantees.length ? (
                  guarantees.map((guarantee, index) => (
                    <GuaranteeDetails
                      key={guarantee.id ?? `${guarantee.tipo}-${index}`}
                      guarantee={guarantee}
                      index={index}
                    />
                  ))
                ) : (
                  <EmptyDetail>Este aluguel não possui garantia cadastrada.</EmptyDetail>
                )}
              </SectionSurface>

              <SectionSurface
                id={sectionId("imovel")}
                sectionKey="imovel"
                icon={Building2}
                title="Imóvel e proprietário"
                description="Identificação do bem e dados do titular cadastrado."
                className="xl:col-span-7"
              >
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="min-w-0">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid size-7 place-items-center rounded-lg bg-primary/8 text-primary">
                        <Home className="size-3.5" />
                      </span>
                      <h4 className="text-xs font-extrabold uppercase tracking-[0.08em] text-foreground/68">
                        Imóvel
                      </h4>
                    </div>
                    <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                      <DetailField
                        label="Identificação"
                        value={contract.property.apelido}
                        emphasis
                        className="sm:col-span-2 lg:col-span-1 2xl:col-span-2"
                      />
                      <DetailField
                        label="Tipo"
                        value={PROPERTY_TYPE_LABELS[contract.property.tipo]}
                      />
                      <DetailField
                        label="Área"
                        value={contract.property.areaM2 ? `${contract.property.areaM2} m²` : null}
                      />
                      <DetailField
                        label="Endereço"
                        value={address}
                        className="sm:col-span-2 lg:col-span-1 2xl:col-span-2"
                      />
                      <DetailField
                        label="Bairro · Cidade/UF"
                        value={city}
                        className="sm:col-span-2 lg:col-span-1 2xl:col-span-2"
                      />
                      <DetailField
                        label="Cômodos"
                        value={`${contract.property.quartos ?? 0} quartos · ${
                          contract.property.banheiros ?? 0
                        } banheiros · ${contract.property.vagas ?? 0} vagas`}
                        className="sm:col-span-2 lg:col-span-1 2xl:col-span-2"
                      />
                    </dl>
                  </div>

                  <div className="min-w-0 border-t border-foreground/[0.07] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <div className="mb-3 flex items-center gap-2">
                      <span className="grid size-7 place-items-center rounded-lg bg-amber-500/10 text-amber-800">
                        <UserRound className="size-3.5" />
                      </span>
                      <h4 className="text-xs font-extrabold uppercase tracking-[0.08em] text-foreground/68">
                        Proprietário
                      </h4>
                    </div>
                    {hasOwner ? (
                      <dl className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
                        <DetailField
                          label="Nome"
                          value={contract.property.proprietarioNome}
                          emphasis
                          className="sm:col-span-2 lg:col-span-1 2xl:col-span-2"
                        />
                        <DetailField label="CPF/CNPJ" value={contract.property.proprietarioCpf} />
                        <DetailField
                          label="Telefone"
                          value={contract.property.proprietarioTelefone}
                        />
                        <DetailField
                          label="E-mail"
                          value={contract.property.proprietarioEmail}
                          className="sm:col-span-2 lg:col-span-1 2xl:col-span-2"
                        />
                      </dl>
                    ) : (
                      <EmptyDetail>
                        Nenhuma informação de proprietário foi cadastrada para este imóvel.
                      </EmptyDetail>
                    )}
                  </div>
                </div>
              </SectionSurface>
            </div>

            <RentalDocuments contractId={contract.id} sectionId={sectionId("documentos")} />
          </div>
        </div>

        <footer className="shrink-0 border-t border-foreground/[0.07] bg-[#f7f3ed]/96 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="grid gap-3 lg:flex lg:items-center lg:justify-between">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {onEdit && (
                <ActionButton
                  icon={Pencil}
                  variant="primary"
                  onClick={() => onEdit(contract)}
                  disabled={Boolean(pendingAction)}
                  className="col-span-2 sm:min-w-36"
                >
                  Editar aluguel
                </ActionButton>
              )}
              <ActionButton
                icon={CheckCircle2}
                variant="success"
                onClick={() => runAction("paid", onMarkPaid)}
                disabled={Boolean(pendingAction)}
              >
                {pendingAction === "paid" ? "Atualizando…" : "Marcar pago"}
              </ActionButton>
              <ActionButton
                icon={RotateCcw}
                onClick={() => runAction("renew", onRenew)}
                disabled={Boolean(pendingAction)}
              >
                {pendingAction === "renew" ? "Renovando…" : "Renovar +12m"}
              </ActionButton>
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/72 px-3.5 text-xs font-bold text-foreground ring-1 ring-foreground/8 transition duration-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transition-none"
                >
                  <MessageCircle className="size-4" />
                  WhatsApp
                </a>
              )}
              {mailUrl && (
                <a
                  href={mailUrl}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/72 px-3.5 text-xs font-bold text-foreground ring-1 ring-foreground/8 transition duration-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 motion-reduce:transition-none"
                >
                  <Mail className="size-4" />
                  E-mail
                </a>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 lg:flex">
              <ActionButton
                icon={XCircle}
                variant="warning"
                onClick={() => runAction("close", onClose)}
                disabled={Boolean(pendingAction)}
              >
                {pendingAction === "close" ? "Encerrando…" : "Encerrar"}
              </ActionButton>
              <ActionButton
                icon={Trash2}
                variant="danger"
                onClick={() => runAction("delete", onDelete)}
                disabled={Boolean(pendingAction)}
              >
                {pendingAction === "delete" ? "Excluindo…" : "Excluir"}
              </ActionButton>
            </div>
          </div>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
