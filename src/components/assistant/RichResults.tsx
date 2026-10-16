import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Circle,
  Clock3,
  MapPin,
  Plus,
  SearchX,
} from "lucide-react";
import { useState } from "react";
import { bindSelectionDraft, selectionDraft, useSelectionDraft } from "@/lib/selecoes/draft-store";
import { useSession } from "@/lib/auth-mock";
import { useEffect } from "react";
import type { AssistantResult, AssistantStep } from "@/lib/agent/stream";

type Row = Record<string, unknown>;
const text = (row: Row, ...keys: string[]) => {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  return "";
};
export function safeRecordHref(value: unknown): string | undefined {
  return typeof value === "string" &&
    /^\/(imoveis|clientes|atendimentos|agenda|agenciamentos|alugueis|corretores|vendas|selecoes)(\/|\?|$)/.test(
      value,
    ) &&
    !value.includes("\\")
    ? value
    : undefined;
}
export function safeSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password) return url.href;
  } catch {}
  return undefined;
}
const brl = (n: unknown) =>
  typeof n === "number" || (typeof n === "string" && n !== "")
    ? new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      }).format(Number(n))
    : "Valor não informado";
const time = (value: unknown) => {
  if (typeof value !== "string") return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
};

export function StepTimeline({ steps }: { steps: AssistantStep[] }) {
  const [open, setOpen] = useState(false);
  if (!steps.length) return null;
  const running = steps.some((s) => s.status === "running");
  return (
    <div className="assistant-steps">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-xs text-muted-foreground"
      >
        <span className={running ? "assistant-pulse" : ""}>
          {running ? <Clock3 size={13} /> : <Check size={13} />}
        </span>
        {running
          ? steps.find((s) => s.status === "running")?.label
          : `${steps.length} ${steps.length === 1 ? "consulta realizada" : "consultas realizadas"}`}
        <ChevronDown
          size={13}
          className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ol className="mt-3 space-y-2 border-l border-border pl-3">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              {s.status === "done" ? <Check size={12} /> : <Circle size={10} />}
              <span>{s.label}</span>
              <span className="sr-only">
                {s.status === "running"
                  ? "Em andamento"
                  : s.status === "error"
                    ? "Falhou"
                    : "Concluído"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function RichPropertyCard({
  property,
  onSelect,
  selected = false,
}: {
  property: Row;
  onSelect?: (id: string) => void;
  selected?: boolean;
}) {
  const href = safeRecordHref(property.href);
  const id = text(property, "id");
  const photo = text(property, "photoUrl", "photo_url", "imagem", "cover_url", "foto");
  const price = property.valor ?? property.price;
  const reasons = Array.isArray(property.reasons)
    ? property.reasons
    : Array.isArray(property.motivos)
      ? property.motivos
      : [];
  return (
    <article className="assistant-property">
      <div className="assistant-property-image">
        {photo && /^https:\/\//.test(photo) ? (
          <img src={photo} alt={text(property, "tipo", "type") || "Imóvel"} loading="lazy" />
        ) : (
          <Building2 size={31} strokeWidth={1.2} />
        )}
        <span className="assistant-property-code">
          {text(property, "codigo", "code") || "Imóvel"}
        </span>
        {typeof property.score === "number" && (
          <span className="assistant-property-score">{property.score}% compatível</span>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold">{brl(price)}</p>
        <p className="mt-1 truncate text-xs font-medium">
          {text(property, "tipo", "type") || "Imóvel"}
          {text(property, "quartos", "dormitorios")
            ? ` · ${text(property, "quartos", "dormitorios")} quartos`
            : ""}
        </p>
        <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <MapPin size={11} />
          {[text(property, "bairro"), text(property, "cidade")].filter(Boolean).join(", ") ||
            "Localização no cadastro"}
        </p>
        {reasons.slice(0, 3).map((r, i) => (
          <p key={i} className="mt-1 text-[10px] text-muted-foreground">
            ✓ {String(r)}
          </p>
        ))}
        <div className="mt-3 flex gap-1.5">
          {href && (
            <a href={href} className="assistant-small-button flex-1">
              Abrir <ArrowUpRight size={12} />
            </a>
          )}
          {onSelect && id && (
            <button
              type="button"
              onClick={() => onSelect(id)}
              className="assistant-small-button"
              aria-label={
                selected ? "Remover do rascunho de seleção" : "Adicionar ao rascunho de seleção"
              }
              title="Somente rascunho local. O link é criado na tela de Seleções."
            >
              {selected ? <Check size={13} /> : <Plus size={13} />} Seleção
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function PropertyResults({ rows }: { rows: Row[] }) {
  const session = useSession();
  const draft = useSelectionDraft();
  useEffect(() => bindSelectionDraft(session?.id ?? null), [session?.id]);
  return (
    <>
      <div className="assistant-property-grid">
        {rows.map((r, i) => (
          <RichPropertyCard
            key={text(r, "id") || i}
            property={r}
            selected={draft.ids.includes(text(r, "id"))}
            onSelect={session ? (id) => selectionDraft.toggle(id) : undefined}
          />
        ))}
      </div>
      {draft.ids.length > 0 && (
        <a
          href="/selecoes"
          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary"
        >
          Revisar rascunho de seleção ({draft.ids.length}) <ArrowUpRight size={12} />
        </a>
      )}
    </>
  );
}

const collectionTitles: Record<string, string> = {
  events: "Sua agenda",
  attendances: "Atendimentos",
  clients: "Clientes",
  agenciamentos: "Agenciamentos",
  contracts: "Contratos",
  ranking: "Equipe",
  history: "Histórico do atendimento",
  sources: "Fontes consultadas",
};
function RecordList({ kind, rows }: { kind: string; rows: Row[] }) {
  return (
    <div className="assistant-record-list">
      {rows.map((row, index) => {
        const href = kind === "sources" ? safeSourceUrl(row.url) : safeRecordHref(row.href);
        const title =
          text(
            row,
            "titulo",
            "title",
            "nome",
            "name",
            "cliente",
            "cliente_nome",
            "codigo",
            "corretor",
            "brokerName",
            "tipo",
          ) || "Registro";
        return (
          <article key={text(row, "id") || index} className="assistant-record-row">
            <div className="assistant-record-icon">
              {kind === "events" ? <CalendarDays size={16} /> : <Building2 size={16} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {[
                  text(row, "etapa", "pipeline_stage", "status", "tipo"),
                  time(
                    row.inicio ??
                      row.start_at ??
                      row.proximoRetorno ??
                      row.vencimento ??
                      row.criadoEm ??
                      row.created_at,
                  ),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {text(row, "proximoPasso", "proximo_passo", "resumo", "motivo") && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {text(row, "proximoPasso", "proximo_passo", "resumo", "motivo")}
                </p>
              )}
              {typeof row.total === "number" && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/10">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${Math.max(3, Math.min(100, Number(row.total)))}%` }}
                  />
                </div>
              )}
            </div>
            {href && (
              <a
                href={href}
                target={kind === "sources" ? "_blank" : undefined}
                rel={kind === "sources" ? "noopener noreferrer" : undefined}
                className="assistant-icon-button"
                aria-label={`Abrir ${title}`}
              >
                <ArrowUpRight size={15} />
              </a>
            )}
          </article>
        );
      })}
    </div>
  );
}

const metricLabels: Record<string, string> = {
  total: "Total",
  available: "Disponíveis",
  disponiveis: "Disponíveis",
  active: "Ativos",
  ativos: "Ativos",
  overdue: "Em atraso",
  atrasados: "Em atraso",
  totalOverdue: "Total em atraso",
  totalContracts: "Contratos",
  totalProperties: "Imóveis",
  totalClients: "Clientes",
  count: "Encontrados",
  totalAttends: "Atendimentos",
  totalValue: "Valor total",
  value: "Valor",
  ocupados: "Ocupados",
  totalImoveis: "Imóveis",
  valorTotal: "Valor total",
  totalAluguel: "Aluguel total",
  inadimplencia: "Inadimplência",
  visiveisNoSite: "No site",
  rascunhos: "Rascunhos",
  considerados: "Imóveis analisados",
};
export function RichToolResult({
  result,
  allowSelection = true,
}: {
  result: AssistantResult;
  allowSelection?: boolean;
}) {
  const data = result.data;
  if (!data || typeof data !== "object") return null;
  const obj = data as Row;
  const collections = Object.keys(collectionTitles).filter((k) => Array.isArray(obj[k]));
  const properties = Array.isArray(obj.properties) ? (obj.properties as Row[]) : [];
  const metrics = Object.entries(
    obj.summary && typeof obj.summary === "object" ? (obj.summary as Row) : obj,
  )
    .filter(([k, v]) => metricLabels[k] && typeof v === "number")
    .slice(0, 6);
  const record = obj.record && typeof obj.record === "object" ? (obj.record as Row) : undefined;
  const empty =
    (!properties.length &&
      collections.length > 0 &&
      collections.every((k) => !(obj[k] as unknown[]).length)) ||
    (Array.isArray(obj.properties) && !properties.length);
  return (
    <section className="assistant-rich-result" aria-label="Resultados do sistema">
      {obj.expirationAvailable === false && (
        <p className="rounded-xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
          O cadastro não informa vencimento. Estes agenciamentos têm pendências para revisar.
        </p>
      )}
      {Array.isArray(obj.missingCriteria) && obj.missingCriteria.length > 0 && (
        <p className="rounded-xl bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">
          Para refinar o match, faltam no cadastro: {obj.missingCriteria.join(", ")}.
        </p>
      )}
      {(obj.status === "not_configured" || obj.status === "unavailable") && (
        <p
          role="status"
          className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground"
        >
          {typeof obj.message === "string" ? obj.message : "Esta consulta está indisponível."}
        </p>
      )}
      {metrics.length > 0 && (
        <div className="assistant-kpis">
          {metrics.map(([key, value]) => (
            <div key={key}>
              <strong>
                {/valor|value|overdue|aluguel|inadimplencia/i.test(key) && key !== "overdue"
                  ? brl(value)
                  : Number(value).toLocaleString("pt-BR")}
              </strong>
              <span>{metricLabels[key]}</span>
            </div>
          ))}
        </div>
      )}
      {properties.length > 0 &&
        (allowSelection ? (
          <PropertyResults rows={properties} />
        ) : (
          <div className="assistant-property-grid">
            {properties.map((p, i) => (
              <RichPropertyCard key={i} property={p} />
            ))}
          </div>
        ))}
      {collections.map(
        (key) =>
          (obj[key] as Row[]).length > 0 && (
            <div key={key}>
              <h4 className="mb-2 text-[11px] font-semibold text-muted-foreground">
                {collectionTitles[key]}
              </h4>
              <RecordList kind={key} rows={obj[key] as Row[]} />
            </div>
          ),
      )}
      {record && <RecordList kind="record" rows={[record]} />}{" "}
      {obj.record === null && (
        <p className="text-xs text-muted-foreground">
          Não encontrei esse registro no seu escopo de acesso.
        </p>
      )}
      {empty && obj.status !== "not_configured" && (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed p-4 text-xs text-muted-foreground">
          <SearchX size={17} />
          Não encontrei registros com esses critérios.
        </div>
      )}
    </section>
  );
}
