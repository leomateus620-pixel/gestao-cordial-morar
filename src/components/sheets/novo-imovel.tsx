import { useState } from "react";
import { FormSheet, Field, inputCls, submitCls } from "./form-shell";
import { useApp } from "@/store/app-store";
import type { AgencyId, Imovel } from "@/lib/mock/data";
import fallback from "@/assets/properties/apto-jardins.jpg";

export function NovoImovelSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const addImovel = useApp((s) => s.addImovel);
  const [titulo, setTitulo] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("São Paulo");
  const [tipo, setTipo] = useState<Imovel["tipo"]>("Apartamento");
  const [finalidade, setFinalidade] = useState<Imovel["finalidade"]>("Venda");
  const [valor, setValor] = useState(0);
  const [quartos, setQuartos] = useState(2);
  const [area, setArea] = useState(80);
  const [imobiliaria, setImobiliaria] = useState<AgencyId>("cordial");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    addImovel({
      titulo, endereco, bairro, cidade, tipo, finalidade, valor, quartos, area,
      status: "Disponível", imobiliaria, foto: fallback,
    });
    onOpenChange(false);
    setTitulo(""); setEndereco(""); setBairro(""); setValor(0);
  }

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title="Novo imóvel">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Título">
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} required />
        </Field>
        <Field label="Endereço">
          <input value={endereco} onChange={(e) => setEndereco(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bairro">
            <input value={bairro} onChange={(e) => setBairro(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Cidade">
            <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Imovel["tipo"])} className={inputCls}>
              {(["Apartamento", "Casa", "Cobertura", "Loft", "Terreno"] as const).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Finalidade">
            <select value={finalidade} onChange={(e) => setFinalidade(e.target.value as Imovel["finalidade"])} className={inputCls}>
              <option value="Venda">Venda</option>
              <option value="Aluguel">Aluguel</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Valor (R$)">
            <input type="number" value={valor || ""} onChange={(e) => setValor(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Quartos">
            <input type="number" value={quartos} onChange={(e) => setQuartos(Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Área (m²)">
            <input type="number" value={area} onChange={(e) => setArea(Number(e.target.value))} className={inputCls} />
          </Field>
        </div>
        <Field label="Imobiliária">
          <select value={imobiliaria} onChange={(e) => setImobiliaria(e.target.value as AgencyId)} className={inputCls}>
            <option value="cordial">Cordial Imóveis</option>
            <option value="morar">Morar Imóveis</option>
          </select>
        </Field>
        <button type="submit" className={submitCls}>Cadastrar imóvel</button>
      </form>
    </FormSheet>
  );
}