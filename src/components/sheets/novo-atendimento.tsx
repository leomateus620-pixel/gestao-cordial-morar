import { useState } from "react";
import { FormSheet, Field, inputCls, submitCls } from "./form-shell";
import { useApp } from "@/store/app-store";
import type { AgencyId, AtendimentoStatus, OrigemLead } from "@/lib/mock/data";

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
  const [status, setStatus] = useState<AtendimentoStatus>("Novo");
  const [origem, setOrigem] = useState<OrigemLead>("WhatsApp");
  const [prioridade, setPrioridade] = useState<"Baixa" | "Média" | "Alta">("Média");
  const [proximoRetorno, setProximoRetorno] = useState("");
  const [motivoPerda, setMotivoPerda] = useState("");
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
      origem,
      prioridade,
      proximoRetorno: proximoRetorno ? new Date(proximoRetorno).toISOString() : undefined,
      motivoPerda: status === "Perdido" ? motivoPerda : undefined,
      historico: [
        {
          data: new Date().toISOString(),
          descricao: "Atendimento criado pelo formulário.",
          responsavelId: corretorId,
        },
      ],
    });
    onOpenChange(false);
    setObservacoes("");
    setProximoRetorno("");
    setMotivoPerda("");
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Novo atendimento"
      description="Registre um novo contato ou negociação."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Cliente">
          <select
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className={inputCls}
          >
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Imóvel">
          <select
            value={imovelId}
            onChange={(e) => setImovelId(e.target.value)}
            className={inputCls}
          >
            {imoveis.map((i) => (
              <option key={i.id} value={i.id}>
                {i.titulo}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Corretor">
          <select
            value={corretorId}
            onChange={(e) => setCorretorId(e.target.value)}
            className={inputCls}
          >
            {corretores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} — {c.imobiliaria === "cordial" ? "Cordial" : "Morar"}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AtendimentoStatus)}
              className={inputCls}
            >
              {(
                [
                  "Novo",
                  "Em atendimento",
                  "Aguardando retorno",
                  "Visita agendada",
                  "Proposta enviada",
                  "Negociação",
                  "Fechado",
                  "Perdido",
                  "Arquivado",
                ] as const
              ).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Origem">
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value as typeof origem)}
              className={inputCls}
            >
              {(["WhatsApp", "Site", "Indicação", "Porta fria", "Instagram"] as const).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prioridade">
            <select
              value={prioridade}
              onChange={(e) => setPrioridade(e.target.value as typeof prioridade)}
              className={inputCls}
            >
              <option>Baixa</option>
              <option>Média</option>
              <option>Alta</option>
            </select>
          </Field>
          <Field label="Próximo retorno">
            <input
              type="datetime-local"
              value={proximoRetorno}
              onChange={(e) => setProximoRetorno(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        {status === "Perdido" && (
          <Field label="Motivo da perda">
            <input
              value={motivoPerda}
              onChange={(e) => setMotivoPerda(e.target.value)}
              className={inputCls}
              placeholder="Preço, localização, crédito..."
            />
          </Field>
        )}
        <Field label="Observações">
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className={inputCls}
            placeholder="Detalhes da negociação, próximos passos..."
          />
        </Field>
        <button type="submit" className={submitCls}>
          Salvar atendimento
        </button>
      </form>
    </FormSheet>
  );
}
