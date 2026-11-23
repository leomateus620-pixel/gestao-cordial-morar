import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Row = {
  id: string;
  nome: string;
  cnpj: string | null;
  clause_template: string;
  active: boolean;
};

/** Seguradoras parceiras e a cláusula obrigatória de cada uma (só admin edita). */
export function RentalInsurersSettings({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ["rental-insurers", "settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rental_insurers")
        .select("id,nome,cnpj,clause_template,active")
        .order("nome");
      if (error) throw error;
      return data as Row[];
    },
  });
  const save = useMutation({
    mutationFn: async (r: Partial<Row> & { nome: string; clause_template: string }) => {
      const payload = {
        nome: r.nome.trim(),
        cnpj: r.cnpj?.trim() || null,
        clause_template: r.clause_template.trim(),
        active: r.active ?? true,
        updated_at: new Date().toISOString(),
      };
      const { error } = r.id
        ? await supabase.from("rental_insurers").update(payload).eq("id", r.id)
        : await supabase.from("rental_insurers").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Seguradora salva.");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["rental-insurers"] });
    },
    onError: () => toast.error("Não foi possível salvar a seguradora."),
  });

  return (
    <div className="glass-panel space-y-3 rounded-3xl p-4">
      {(q.data ?? []).map((r) => (
        <div
          key={r.id}
          className="flex items-center gap-3 border-b border-border/40 pb-3 last:border-0 last:pb-0"
        >
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{r.nome}</p>
            <p className="text-[11px] text-foreground/55">
              {r.active ? "Ativa" : "Desativada"}
              {r.cnpj ? ` · CNPJ ${r.cnpj}` : ""}
            </p>
          </div>
          {canEdit && (
            <>
              <Switch
                checked={r.active}
                aria-label={`Ativar ${r.nome}`}
                onCheckedChange={(v) => save.mutate({ ...r, active: v })}
              />
              <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                Editar cláusula
              </Button>
            </>
          )}
        </div>
      ))}
      {canEdit && !editing && (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setEditing({ id: "", nome: "", cnpj: "", clause_template: "", active: true })
          }
        >
          + Nova seguradora
        </Button>
      )}
      {editing && (
        <div className="space-y-2 rounded-2xl border border-border/60 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Nome"
              value={editing.nome}
              onChange={(e) => setEditing({ ...editing, nome: e.target.value })}
            />
            <Input
              placeholder="CNPJ"
              value={editing.cnpj ?? ""}
              onChange={(e) => setEditing({ ...editing, cnpj: e.target.value })}
            />
          </div>
          <Textarea
            rows={10}
            value={editing.clause_template}
            onChange={(e) => setEditing({ ...editing, clause_template: e.target.value })}
          />
          <p className="text-[11px] text-foreground/55">
            Campos preenchidos no contrato: {"{{seguro_valor_mensal}}"}, {"{{seguro_valor_total}}"},{" "}
            {"{{seguro_parcelas}}"}.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!editing.nome.trim() || !editing.clause_template.trim() || save.isPending}
              onClick={() => save.mutate(editing.id ? editing : { ...editing, id: undefined })}
            >
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
