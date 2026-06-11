import { useState } from "react";
import { FormSheet, Field, inputCls, submitCls } from "./form-shell";
import { useApp } from "@/store/app-store";
import type { AgencyId, Cliente } from "@/lib/mock/data";

export function NovoClienteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const addCliente = useApp((s) => s.addCliente);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [tipo, setTipo] = useState<Cliente["tipo"]>("Comprador");
  const [interesse, setInteresse] = useState("");
  const [orcamento, setOrcamento] = useState(0);
  const [imobiliaria, setImobiliaria] = useState<AgencyId>("cordial");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    addCliente({ nome, telefone, email, tipo, interesse, orcamento, imobiliaria });
    onOpenChange(false);
    setNome(""); setTelefone(""); setEmail(""); setInteresse(""); setOrcamento(0);
  }

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title="Novo cliente">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome completo">
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefone">
            <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className={inputCls} placeholder="(11) 9..." />
          </Field>
          <Field label="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Cliente["tipo"])} className={inputCls}>
              {(["Comprador", "Locatário", "Vendedor", "Proprietário"] as const).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="E-mail">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Interesse">
          <input value={interesse} onChange={(e) => setInteresse(e.target.value)} className={inputCls} placeholder="Apto 2 quartos Jardins" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Orçamento (R$)">
            <input type="number" value={orcamento || ""} onChange={(e) => setOrcamento(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Imobiliária">
            <select value={imobiliaria} onChange={(e) => setImobiliaria(e.target.value as AgencyId)} className={inputCls}>
              <option value="cordial">Cordial Imóveis</option>
              <option value="morar">Morar Imóveis</option>
            </select>
          </Field>
        </div>
        <button type="submit" className={submitCls}>Cadastrar cliente</button>
      </form>
    </FormSheet>
  );
}