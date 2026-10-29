import type { ReactNode } from "react";
import { Info, CircleAlert, CheckCheck, LoaderCircle } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { GoogleMarketingOverview } from "@/lib/marketing/google-overview.types";

export function GoogleSelect({
  label,
  value,
  onValueChange,
  options,
  className = "",
  icon,
  disabled = false,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label={label} className={`gads-control gads-select ${className}`}>
        {icon && (
          <span className="gads-select-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="gads-menu" position="popper" collisionPadding={12}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="gads-menu-item">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GoogleDataInfo({
  data,
  isRefreshing = false,
}: {
  data: GoogleMarketingOverview;
  isRefreshing?: boolean;
}) {
  let collected = "Não disponível";
  if (data.lastCollectedAt && Number.isFinite(Date.parse(data.lastCollectedAt))) {
    try {
      collected = new Date(data.lastCollectedAt).toLocaleString("pt-BR", {
        timeZone: data.timezone ?? "UTC",
      });
    } catch {
      collected = `${new Date(data.lastCollectedAt).toLocaleString("pt-BR", { timeZone: "UTC" })} (UTC)`;
    }
  }
  return (
    <div className="gads-data-bar">
      <div className="gads-data-status">
        <span className="gads-coverage" data-coverage={data.coverage}>
          {data.coverage === "complete" ? (
            <CheckCheck size={14} aria-hidden="true" />
          ) : (
            <CircleAlert size={14} aria-hidden="true" />
          )}
          {data.coverage === "partial"
            ? "Dados parciais"
            : data.coverage === "complete"
              ? "Coleta completa"
              : "Sem dados no período"}
        </span>
        <span
          role="status"
          className="gads-refresh-status"
          title={isRefreshing ? "Atualizando dados" : undefined}
        >
          {isRefreshing && (
            <>
              <LoaderCircle size={12} aria-hidden="true" />
              <span className="sr-only">Atualizando dados</span>
            </>
          )}
        </span>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button className="gads-data-info" type="button">
            <Info size={14} aria-hidden="true" />
            Informações dos dados
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="gads-popover gads-data-panel"
          aria-label="Informações dos dados Google Ads"
        >
          <h3>Informações dos dados</h3>
          <p>
            {data.coverage === "partial"
              ? "Os valores representam a coleta disponível. A cobertura do período não foi comprovada; os totais podem estar incompletos."
              : data.coverage === "complete"
                ? "A coleta cobre todo o período selecionado."
                : "Não há coleta comprovada neste período. Valores ausentes são exibidos como traço, nunca como zero."}
          </p>
          <dl>
            <div>
              <dt>Última coleta</dt>
              <dd>{collected}</dd>
            </div>
            <div>
              <dt>Moeda</dt>
              <dd>{data.currency ?? "Não informada"}</dd>
            </div>
            <div>
              <dt>Fuso da conta</dt>
              <dd>{data.timezone ?? "Não informado"}</dd>
            </div>
            <div>
              <dt>Origem</dt>
              <dd>Coleta Google Ads · status registrado no Gestão</dd>
            </div>
          </dl>
          <p>
            Datas sem coleta mantêm lacunas. Agrupamentos incompletos não são somados. O dia atual
            está em andamento. A comparação com o período anterior e o status nativo Google ainda
            não foram comprovados.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}
