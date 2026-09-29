import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ptBR } from "date-fns/locale";
import { Loader2, Printer, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  listBrokerAttendanceHistoryReport,
  listAttendanceReportContacts,
  listClientAttendanceHistoryReport,
} from "@/lib/attendances/history-report.functions";
import type { Atendimento } from "@/types/atendimento";
import type { HistoryPrintPayload } from "./AtendimentoHistoryPrintReport";

type Contact = {
  key: string;
  nome: string;
  telefone: string;
  email?: string;
  clientId?: string;
  corretorNome?: string;
  ids: string[];
};

const digits = (v: string) => v.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseKey = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined;
};
const br = (v: string) => parseKey(v)?.toLocaleDateString("pt-BR") ?? "";

export function AtendimentoHistoryReportDialog({
  open,
  onOpenChange,
  brokers,
  atendimentos,
  onPrint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brokers: Array<{ id: string; nome: string }>;
  atendimentos: Atendimento[];
  onPrint: (payload: HistoryPrintPayload) => void;
}) {
  const [mode, setMode] = useState<"corretor" | "cliente">("corretor");
  const [brokerId, setBrokerId] = useState("");
  const [contactKey, setContactKey] = useState("");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<"total" | "personalizado">("total");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const contactsFn = useServerFn(listAttendanceReportContacts);
  const contactRows = useQuery({
    queryKey: ["attendance-history-report-contacts"],
    enabled: open && mode === "cliente",
    retry: false,
    queryFn: () => contactsFn(),
  });
  const contacts = useMemo(() => {
    const map = new Map<string, Contact>();
    const source =
      contactRows.data ??
      atendimentos.map((a) => ({
        id: a.id,
        clienteNome: a.clienteNome,
        telefone: a.telefone,
        email: a.email ?? null,
        clienteId: a.clienteId ?? a.clienteConvertidoId ?? null,
        corretorNome: a.corretorNome ?? null,
      }));
    // Agrupa a mesma pessoa: telefone (últimos 8 dígitos) > e-mail > cadastro > atendimento.
    const alias = new Map<string, string>();
    for (const a of source) {
      const p8 = digits(a.telefone ?? "").slice(-8);
      const mail = (a.email ?? "").trim().toLowerCase();
      const keys = [
        p8.length === 8 ? `tel:${p8}` : "",
        mail ? `mail:${mail}` : "",
        a.clienteId ? `cli:${a.clienteId}` : "",
      ].filter(Boolean);
      const existing = keys.map((k) => alias.get(k)).find(Boolean);
      const key = existing ?? keys[0] ?? `att:${a.id}`;
      keys.forEach((k) => alias.set(k, key));
      const c = map.get(key) ?? { key, nome: a.clienteNome, telefone: a.telefone, ids: [] };
      c.ids.push(a.id);
      if (!c.nome && a.clienteNome) c.nome = a.clienteNome;
      c.email ??= a.email ?? undefined;
      c.clientId ??= a.clienteId ?? undefined;
      c.corretorNome ??= a.corretorNome ?? undefined;
      map.set(key, c);
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [atendimentos, contactRows.data]);

  const LIST_LIMIT = 100;
  const matchedContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qd = digits(q);
    return q
      ? contacts.filter(
          (c) =>
            c.nome.toLowerCase().includes(q) ||
            (qd.length >= 3 && digits(c.telefone).includes(qd)) ||
            c.email?.toLowerCase().includes(q),
        )
      : contacts;
  }, [contacts, search]);
  const filteredContacts = matchedContacts.slice(0, LIST_LIMIT);

  const [contact, setContact] = useState<Contact | null>(null);
  const contactKey = contact?.key ?? "";
  const broker = brokers.find((b) => b.id === brokerId);
  const periodReady = period === "total" || Boolean(from && to);
  const targetReady = mode === "corretor" ? Boolean(broker) : Boolean(contact);
  const periodInput =
    period === "total"
      ? ({ period: "total" } as const)
      : ({ period: "personalizado", from, to } as const);

  const brokerFn = useServerFn(listBrokerAttendanceHistoryReport);
  const clientFn = useServerFn(listClientAttendanceHistoryReport);
  const report = useQuery({
    queryKey: ["attendance-history-report", mode, brokerId, contactKey, contact?.ids.length, period, from, to],
    enabled: open && targetReady && periodReady,
    retry: false,
    queryFn: () =>
      mode === "corretor"
        ? brokerFn({ data: { brokerId, ...periodInput } })
        : clientFn({
            data: {
              clientId: contact?.clientId ?? null,
              attendanceIds: contact?.ids ?? [],
              phone: contact?.telefone ?? null,
              email: contact?.email ?? null,
              ...periodInput,
            },
          }),
  });

  const counts = report.data
    ? {
        att: report.data.attendances.length,
        ev: report.data.events.filter((e) =>
          report.data!.attendances.some((a) => a.id === e.attendanceId),
        ).length,
      }
    : null;
  const canPrint = targetReady && periodReady && Boolean(counts && counts.att > 0) && !report.isFetching;
  const periodLabel = period === "total" ? "Todo o período" : `${br(from)} a ${br(to)}`;

  const handlePrint = () => {
    if (!report.data) return;
    onPrint({
      mode,
      targetName: mode === "corretor" ? broker!.nome : contact!.nome,
      periodLabel,
      contact:
        mode === "cliente"
          ? { telefone: contact!.telefone, email: contact!.email, corretorAtual: contact!.corretorNome }
          : undefined,
      result: report.data,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportar histórico</DialogTitle>
          <DialogDescription>
            Gere um PDF com o histórico de um corretor ou de um cliente. Não depende dos filtros da tela.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Segmented
            label="Relatório de"
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            options={[
              { value: "corretor", label: "Corretor" },
              { value: "cliente", label: "Cliente" },
            ]}
          />

          {mode === "corretor" ? (
            <div>
              <Label>Corretor</Label>
              <select
                aria-label="Corretor do relatório"
                value={brokerId}
                onChange={(e) => setBrokerId(e.target.value)}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecione um corretor</option>
                {[...brokers]
                  .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div>
              <Label>Cliente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar cliente"
                  placeholder="Nome, telefone ou e-mail"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border">
                {filteredContacts.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Nenhum contato encontrado.</p>
                ) : (
                  filteredContacts.map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setContactKey(c.key)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted",
                        c.key === contactKey && "bg-primary/10",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{c.nome}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.telefone} {c.corretorNome ? `· ${c.corretorNome}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.ids.length} atend.
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <Segmented
            label="Período"
            value={period}
            onChange={(v) => setPeriod(v as typeof period)}
            options={[
              { value: "total", label: "Total" },
              { value: "personalizado", label: "Personalizado" },
            ]}
          />
          {period === "personalizado" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <DatePick label="Data inicial" value={from} max={to} onChange={setFrom} />
              <DatePick label="Data final" value={to} min={from} onChange={setTo} />
            </div>
          )}

          <div className="rounded-xl bg-muted px-4 py-3 text-sm" aria-live="polite">
            {!targetReady ? (
              `Selecione ${mode === "corretor" ? "um corretor" : "um cliente"}.`
            ) : !periodReady ? (
              "Escolha as datas inicial e final."
            ) : report.isFetching ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Calculando…
              </span>
            ) : report.isError ? (
              <span className="text-destructive">
                {(report.error as Error)?.message ?? "Não foi possível carregar o histórico."}
              </span>
            ) : counts && counts.att === 0 ? (
              "Nenhum atendimento encontrado no período."
            ) : counts ? (
              <>
                <strong>{counts.att}</strong> atendimentos · <strong>{counts.ev}</strong> eventos no período
                {report.data?.truncated && " (limite de 2.000 eventos atingido)"}
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handlePrint} disabled={!canPrint}>
            <Printer className="size-4" /> Imprimir / PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/45">
      {children}
    </span>
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <Label>{label}</Label>
      <div className="inline-flex rounded-xl border border-border p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
              value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DatePick({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  const selected = parseKey(value);
  const minDate = min ? parseKey(min) : undefined;
  const maxDate = max ? parseKey(max) : undefined;
  return (
    <div>
      <Label>{label}</Label>
      <div className="rounded-xl border border-border p-1.5">
        <p className="px-1.5 pb-1 text-xs font-bold text-foreground/70">{value ? br(value) : "Selecionar"}</p>
        <Calendar
          mode="single"
          locale={ptBR}
          weekStartsOn={1}
          selected={selected}
          defaultMonth={selected ?? minDate ?? maxDate}
          onSelect={(d) => onChange(d ? toKey(d) : "")}
          disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
          className="pointer-events-auto w-full bg-transparent p-1 [--cell-size:1.9rem]"
        />
      </div>
    </div>
  );
}
