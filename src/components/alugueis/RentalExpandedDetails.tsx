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
  Pencil,
  RotateCcw,
  Trash2,
  XCircle,
} from "lucide-react";
import { RentalPaymentBadge, RentalStatusBadge } from "./RentalStatusBadge";
import { RentalDocuments } from "./RentalDocuments";

function fmtDate(s?: string | null) {
  return s ? new Date(s).toLocaleDateString("pt-BR") : "—";
}

function BrandBadge({ brand }: { brand?: string | null }) {
  const b = brand === "morar" ? "morar" : "cordial";
  const label = b === "morar" ? "Morar" : "Cordial";
  const cls =
    b === "morar"
      ? "bg-[color:var(--morar-primary,#8b5cf6)]/12 text-[color:var(--morar-primary,#8b5cf6)] ring-[color:var(--morar-primary,#8b5cf6)]/25"
      : "bg-[color:var(--cordial-primary,#0ea5e9)]/12 text-[color:var(--cordial-primary,#0ea5e9)] ring-[color:var(--cordial-primary,#0ea5e9)]/25";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${cls}`}>
      {label}
    </span>
  );
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
  onEdit,
}: {
  contract: RentalContractFull | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onClose: (id: string) => void;
  onRenew: (id: string) => void;
  onMarkPaid: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (contract: RentalContractFull) => void;
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
          <div className="flex items-center gap-2">
            <SheetTitle className="text-base">{contract.property.apelido}</SheetTitle>
            <BrandBadge brand={contract.brand} />
          </div>
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

          {(() => {
            const guarantees =
              contract.guarantees && contract.guarantees.length > 0
                ? contract.guarantees
                : [];
            return (
              <Section title={`Garantias${guarantees.length > 1 ? ` (${guarantees.length})` : ""}`}>
                {guarantees.length === 0 ? (
                  <Row label="Modalidade" value="Sem garantia" />
                ) : (
                  guarantees.map((g, idx) => (
                    <div key={g.id ?? idx} className={idx > 0 ? "pt-2" : ""}>
                      <Row
                        label={`Garantia ${idx + 1}`}
                        value={
                          g.tipo === "fiador"
                            ? "Fiador"
                            : g.tipo === "caucao"
                              ? "Caução"
                              : "Seguro fiança"
                        }
                      />
                      {g.tipo === "caucao" && (
                        <Row
                          label="Valor da caução"
                          value={g.valorCaucao ? brl(g.valorCaucao) : "—"}
                        />
                      )}
                      {g.tipo === "fiador" && g.guarantor && (
                        <>
                          <Row label="Nome" value={g.guarantor.nome} />
                          <Row label="CPF/CNPJ" value={g.guarantor.cpfCnpj ?? ""} />
                          <Row label="Telefone" value={g.guarantor.telefone ?? ""} />
                          <Row label="E-mail" value={g.guarantor.email ?? ""} />
                          <Row label="Vínculo" value={g.guarantor.vinculo ?? ""} />
                        </>
                      )}
                      {g.tipo === "seguro_fianca" && (
                        <>
                          <Row label="Seguradora" value={g.seguroSeguradora ?? ""} />
                          <Row label="Nº da apólice" value={g.seguroApolice ?? ""} />
                          <Row
                            label="Valor mensal"
                            value={g.seguroValorMensal ? brl(g.seguroValorMensal) : "—"}
                          />
                        </>
                      )}
                    </div>
                  ))
                )}
              </Section>
            );
          })()}

          {(() => {
            const list = contract.tenants && contract.tenants.length > 0
              ? contract.tenants
              : [contract.tenant];
            return (
              <Section title={`Locatários${list.length > 1 ? ` (${list.length})` : ""}`}>
                {list.map((t, idx) => (
                  <div key={t.id} className={idx > 0 ? "pt-2" : ""}>
                    <Row
                      label={idx === 0 ? "Locatário principal" : `Locatário ${idx + 1}`}
                      value={t.nome}
                    />
                    <Row label="CPF/CNPJ" value={t.cpfCnpj ?? ""} />
                    <Row label="Telefone" value={t.telefone} />
                    <Row label="E-mail" value={t.email ?? ""} />
                    <Row label="Profissão" value={t.profissao ?? ""} />
                    <Row
                      label="Renda"
                      value={t.rendaAproximada ? brl(t.rendaAproximada) : ""}
                    />
                    <Row label="Endereço" value={t.endereco ?? ""} />
                  </div>
                ))}
              </Section>
            );
          })()}


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
            {(contract.property.proprietarioNome ||
              contract.property.proprietarioCpf ||
              contract.property.proprietarioEmail) && (
              <>
                <Row
                  label="Proprietário"
                  value={contract.property.proprietarioNome ?? ""}
                />
                <Row
                  label="CPF/CNPJ do proprietário"
                  value={contract.property.proprietarioCpf ?? ""}
                />
                <Row
                  label="E-mail do proprietário"
                  value={contract.property.proprietarioEmail ?? ""}
                />
              </>
            )}
          </Section>

          <RentalDocuments contractId={contract.id} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          {onEdit && (
            <button
              onClick={() => onEdit(contract)}
              className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.99]"
            >
              <Pencil className="size-3.5" /> Editar aluguel
            </button>
          )}
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
