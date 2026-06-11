import { useState } from "react";
import { FormSheet, Field, inputCls, submitCls } from "./form-shell";
import { useApp } from "@/store/app-store";
import type { AgencyId } from "@/lib/mock/data";

export function NovoAtendimentoSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const clientes = useApp((s) => s.clientes);
  const imoveis = useApp((s) => s.imoveis);
  const corretores = useApp((s) => s.corretores);
  const addAtendimento = useApp((s) => s.addAtendimento);

  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [imovelId, setImovelId] = useState(imoveis[0]?.id ?? "");
  const [corretorId, setCorretorId] = useState(corretores[0]?.id ?? "");
  const [status, setStatus] = useState<"Aberto" | "Em visita" | "Proposta" | "Fechado" | "Perdido">("Aberto");
  const [observacoes, setObservacoes] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cor = corretores.find((c) => c.id === corretorId);
    if (!cor) return;
    addAtendimento({
      clienteId,
      imovelId,
      corretorId,
      imobiliaria: cor.imobiliaria as AgencyId,
      status,
      observacoes,
    });
    onOpenChange(false);
    setObservacoes("");
  }

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title="Novo atendimento" description="Registre um novo contato ou negociação.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Cliente">
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={inputCls}>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Field>
        <Field label="Imóvel">
          <select value={imovelId} onChange={(e) => setImovelId(e.target.value)} className={inputCls}>
            {imoveis.map((i) => <option key={i.id} value={i.id}>{i.titulo}</option>)}
          </select>
        </Field>
        <Field label="Corretor">
          <select value={corretorId} onChange={(e) => setCorretorId(e.target.value)} className={inputCls}>
            {corretores.map((c) => <option key={c.id} value={c.id}>{c.nome} — {c.imobiliaria === "cordial" ? "Cordial" : "Morar"}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as never)} className={inputCls}>
            {(["Aberto", "Em visita", "Proposta", "Fechado", "Perdido"] as const).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Observações">
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className={inputCls}
            placeholder="Detalhes da negociação, próximos passos..."
          />
        </Field>
        <button type="submit" className={submitCls}>Salvar atendimento</button>
      </form>
    </FormSheet>
  );
}