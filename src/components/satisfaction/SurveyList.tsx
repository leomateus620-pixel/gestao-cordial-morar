import { useMemo, useState } from "react";
import { Copy, MessageCircle, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StarRating } from "./StarRating";
import { useDeleteSatisfactionSurvey, useSatisfactionSurveys } from "@/hooks/useSatisfaction";
import type { SatisfactionSurvey } from "@/types/satisfaction";

const statusStyle: Record<string, string> = {
  pendente: "bg-amber-100 text-amber-800 border-amber-200",
  respondida: "bg-emerald-100 text-emerald-800 border-emerald-200",
  expirada: "bg-slate-200 text-slate-700 border-slate-300",
};

const statusLabel: Record<string, string> = {
  pendente: "Pendente",
  respondida: "Respondida",
  expirada: "Expirada",
};

function buildUrl(token: string) {
  if (typeof window === "undefined") return `/avaliar/${token}`;
  return `${window.location.origin}/avaliar/${token}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SurveyList() {
  const surveys = useSatisfactionSurveys();
  const del = useDeleteSatisfactionSurvey();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");

  const filtered = useMemo(() => {
    const list = surveys.data ?? [];
    const s = search.trim().toLowerCase();
    return list.filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!s) return true;
      return (
        row.corretor_nome.toLowerCase().includes(s) ||
        row.client_nome.toLowerCase().includes(s) ||
        (row.contexto ?? "").toLowerCase().includes(s)
      );
    });
  }, [surveys.data, search, status]);

  const copy = async (row: SatisfactionSurvey) => {
    try {
      await navigator.clipboard.writeText(buildUrl(row.token));
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const share = (row: SatisfactionSurvey) => {
    const url = buildUrl(row.token);
    const msg = `Olá ${row.client_nome}! Como foi seu atendimento? Deixe sua avaliação: ${url}`;
    const raw = (row.client_contato ?? "").replace(/\D/g, "");
    const base = raw
      ? `https://wa.me/${raw}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(base, "_blank", "noopener");
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta pesquisa? Esta ação não pode ser desfeita.")) return;
    try {
      await del.mutateAsync(id);
      toast.success("Pesquisa excluída");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por corretor, cliente ou contexto"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="respondida">Respondidas</SelectItem>
            <SelectItem value="expirada">Expiradas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-3 sm:hidden">
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma pesquisa encontrada.
          </div>
        )}
        {filtered.map((row) => (
          <div key={row.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{row.client_nome}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Corretor: {row.corretor_nome || "—"}
                </p>
              </div>
              <Badge className={statusStyle[row.status]} variant="outline">
                {statusLabel[row.status]}
              </Badge>
            </div>
            {row.contexto && (
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{row.contexto}</p>
            )}
            {row.rating != null && (
              <div className="mt-2">
                <StarRating value={row.rating} size={16} readOnly />
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Criado em {formatDate(row.created_at)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => copy(row)}>
                <Copy className="mr-1 size-3.5" /> Copiar
              </Button>
              <Button size="sm" variant="secondary" onClick={() => share(row)}>
                <MessageCircle className="mr-1 size-3.5" /> WhatsApp
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(row.id)}>
                <Trash2 className="mr-1 size-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Corretor</TableHead>
              <TableHead>Contexto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Nota</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma pesquisa encontrada.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.client_nome}</TableCell>
                <TableCell className="text-muted-foreground">{row.corretor_nome || "—"}</TableCell>
                <TableCell className="max-w-[220px] truncate text-muted-foreground">
                  {row.contexto ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge className={statusStyle[row.status]} variant="outline">
                    {statusLabel[row.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  {row.rating != null ? (
                    <StarRating value={row.rating} size={14} readOnly />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(row.created_at)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => copy(row)} title="Copiar link">
                      <Copy className="size-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => share(row)} title="WhatsApp">
                      <MessageCircle className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(row.id)}
                      title="Excluir"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
