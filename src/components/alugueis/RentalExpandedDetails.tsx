import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { brl } from "@/lib/format";
import type { RentalContractFull } from "@/types/rental";
import {
  CheckCircle2,
  Mail,
  MessageCircle,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { RentalPaymentBadge, RentalStatusBadge } from "./RentalStatusBadge";
import { RentalDocuments } from "./RentalDocuments";

function fmtDate(s?: string | null) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-xs">
      <span className="text-foreground/55">{label}</span>
      <span className="text-right font-medium text-foreground">{value || "—"}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="liquid-panel rounded-2xl p-4">
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-foreground/55">
        {title}
      </h3>
      <div className="divide-y divide-white/40">{children}</div>
    </div>
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
}: {
  contract: RentalContractFull | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onClose: (id: string) => void;
  onRenew: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (!contract) return null;
  const phone = (contract.tenant.telefone ?? "").replace(/\D/g, "");
  const waUrl = phone ? `https://wa.me/55${phone}` : null;
  const mailUrl = contract.tenant.email ? `mailto:${contract.tenant.email}` : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92vh] max-w-[560px] overflow-y-auto rounded-t-3xl border-white/60 bg-background/95 backdrop-blur-xl"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">{contract.property.apelido}</SheetTitle>
          <SheetDescription className="text-[11px]">
            Contrato de aluguel · {contract.tenant.nome}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center gap-2">
          <RentalStatusBadge status={contract.status} />
          <RentalPaymentBadge status={contract.paymentStatus} />
        </div>

        <div className="mt-4 space-y-3">
          <Section title="Contrato">
            <Row label="Valor mensal" value={brl(contract.valorMensal)} />
            <Row label="Início" value={fmtDate(contract.dataInicio)} />
            <Row label="Fim" value={fmtDate(contract.dataFim)} />
            <Row label="Dia de vencimento" value={`Dia ${contract.diaVencimento}`} />
            <Row label="Próximo vencimento" value={fmtDate(contract.proximoVencimento)} />
            {contract.dataEncerramento && (
              <Row label="Encerrado em" value={fmtDate(contract.dataEncerramento)} />
            )}
            {contract.observacoes && <Row label="Observações" value={contract.observacoes} />}
          </Section>

          <Section title="Garantia">
            <Row
              label="Modalidade"
              value={
                contract.garantiaTipo === "fiador"
                  ? "Fiador"
                  : contract.garantiaTipo === "caucao"
                    ? "Caução"
                    : contract.garantiaTipo === "seguro_fianca"
                      ? "Seguro fiança"
                      : "Sem garantia"
              }
            />
            {contract.garantiaTipo === "caucao" && (
              <Row
                label="Valor da caução"
                value={contract.valorCaucao ? brl(contract.valorCaucao) : "—"}
              />
            )}
            {contract.garantiaTipo === "fiador" && contract.guarantor && (
              <>
                <Row label="Nome" value={contract.guarantor.nome} />
                <Row label="CPF/CNPJ" value={contract.guarantor.cpfCnpj ?? ""} />
                <Row label="Telefone" value={contract.guarantor.telefone ?? ""} />
                <Row label="E-mail" value={contract.guarantor.email ?? ""} />
                <Row label="Vínculo" value={contract.guarantor.vinculo ?? ""} />
              </>
            )}
            {contract.garantiaTipo === "seguro_fianca" && (
              <>
                <Row label="Seguradora" value={contract.seguroSeguradora ?? ""} />
                <Row label="Nº da apólice" value={contract.seguroApolice ?? ""} />
                <Row
                  label="Valor mensal"
                  value={
                    contract.seguroValorMensal ? brl(contract.seguroValorMensal) : "—"
                  }
                />
              </>
            )}
          </Section>

          <Section title="Locatário">
            <Row label="Nome" value={contract.tenant.nome} />
            <Row label="CPF/CNPJ" value={contract.tenant.cpfCnpj ?? ""} />
            <Row label="Telefone" value={contract.tenant.telefone} />
            <Row label="E-mail" value={contract.tenant.email ?? ""} />
            <Row label="Profissão" value={contract.tenant.profissao ?? ""} />
            <Row
              label="Renda"
              value={contract.tenant.rendaAproximada ? brl(contract.tenant.rendaAproximada) : ""}
            />
            <Row label="Endereço" value={contract.tenant.endereco ?? ""} />
          </Section>


          <Section title="Imóvel">
            <Row label="Apelido" value={contract.property.apelido} />
            <Row label="Tipo" value={contract.property.tipo} />
            <Row
              label="Endereço"
              value={[
                contract.property.logradouro,
                contract.property.numero,
                contract.property.complemento,
              ]
                .filter(Boolean)
                .join(", ")}
            />
            <Row label="Bairro" value={contract.property.bairro ?? ""} />
            <Row
              label="Cidade/UF"
              value={[contract.property.cidade, contract.property.uf].filter(Boolean).join("/")}
            />
            <Row
              label="Cômodos"
              value={`${contract.property.quartos ?? 0}q · ${
                contract.property.banheiros ?? 0
              }b · ${contract.property.vagas ?? 0}v`}
            />
            <Row
              label="Área"
              value={contract.property.areaM2 ? `${contract.property.areaM2} m²` : ""}
            />
          </Section>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => onMarkPaid(contract.id)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2.5 text-xs font-semibold text-emerald-700 active:scale-[0.99]"
          >
            <CheckCircle2 className="size-3.5" /> Marcar pago
          </button>
          <button
            onClick={() => onRenew(contract.id)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2.5 text-xs font-semibold text-primary active:scale-[0.99]"
          >
            <RotateCcw className="size-3.5" /> Renovar +12m
          </button>
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/60 px-3 py-2.5 text-xs font-semibold text-foreground active:scale-[0.99]"
            >
              <MessageCircle className="size-3.5" /> WhatsApp
            </a>
          )}
          {mailUrl && (
            <a
              href={mailUrl}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/60 px-3 py-2.5 text-xs font-semibold text-foreground active:scale-[0.99]"
            >
              <Mail className="size-3.5" /> E-mail
            </a>
          )}
          <button
            onClick={() => onClose(contract.id)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-500/10 px-3 py-2.5 text-xs font-semibold text-amber-700 active:scale-[0.99]"
          >
            <XCircle className="size-3.5" /> Encerrar
          </button>
          <button
            onClick={() => onDelete(contract.id)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-500/10 px-3 py-2.5 text-xs font-semibold text-rose-700 active:scale-[0.99]"
          >
            <Trash2 className="size-3.5" /> Excluir
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
