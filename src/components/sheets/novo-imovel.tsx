import { useState } from "react";
import { toast } from "sonner";
import { FormSheet, Field, inputCls, submitCls } from "./form-shell";
import { useCreateImovel } from "@/hooks/useImoveis";
import type { PropertyCarteira, PropertyOperacao } from "@/types/property";

const tipos = [
  "Casa",
  "Apartamento",
  "Terreno",
  "Comercial",
  "Sala Comercial",
  "Chácara",
  "Sítio / Chácara",
  "Área",
  "Área Rural",
  "Galpão",
  "Sobrado",
  "Prédio",
];

function toNumber(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function NovoImovelSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const createImovel = useCreateImovel();
  const [tipo, setTipo] = useState("Casa");
  const [operacao, setOperacao] = useState<PropertyOperacao>("venda");
  const [carteira, setCarteira] = useState<PropertyCarteira>("cordial");
  const [codigo, setCodigo] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("SP");
  const [valor, setValor] = useState("");
  const [dormitorios, setDormitorios] = useState("");
  const [suites, setSuites] = useState("");
  const [banheiros, setBanheiros] = useState("");
  const [vagas, setVagas] = useState("");
  const [area, setArea] = useState("");

  function reset() {
    setCodigo("");
    setLocalizacao("");
    setBairro("");
    setCidade("");
    setValor("");
    setDormitorios("");
    setSuites("");
    setBanheiros("");
    setVagas("");
    setArea("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createImovel.mutateAsync({
        carteira,
        operacao,
        tipo,
        localizacaoExibida: localizacao.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        uf: uf.trim() || null,
        valor: toNumber(valor),
        dormitorios: toNumber(dormitorios),
        suites: toNumber(suites),
        banheiros: toNumber(banheiros),
        vagas: toNumber(vagas),
        areaPrincipal: toNumber(area),
        codigo: codigo.trim() || null,
      });
      toast.success("Imóvel cadastrado no catálogo.");
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error((err as Error)?.message ?? "Não foi possível salvar o imóvel.");
    }
  }

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title="Novo imóvel">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Operação">
            <select
              value={operacao}
              onChange={(e) => setOperacao(e.target.value as PropertyOperacao)}
              className={inputCls}
            >
              <option value="venda">Venda</option>
              <option value="aluguel">Aluguel</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Carteira">
            <select
              value={carteira}
              onChange={(e) => setCarteira(e.target.value as PropertyCarteira)}
              className={inputCls}
            >
              <option value="cordial">Cordial</option>
              <option value="morar">Morar</option>
            </select>
          </Field>
          <Field label="Código">
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Localização exibida">
          <input
            value={localizacao}
            onChange={(e) => setLocalizacao(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Bairro">
            <input value={bairro} onChange={(e) => setBairro(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Cidade">
            <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={inputCls} />
          </Field>
          <Field label="UF">
            <input value={uf} onChange={(e) => setUf(e.target.value)} className={inputCls} maxLength={2} />
          </Field>
        </div>
        <Field label="Valor (R$) — deixe vazio para “Consulte”">
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dormitórios">
            <input
              value={dormitorios}
              onChange={(e) => setDormitorios(e.target.value)}
              inputMode="numeric"
              className={inputCls}
            />
          </Field>
          <Field label="Suítes">
            <input
              value={suites}
              onChange={(e) => setSuites(e.target.value)}
              inputMode="numeric"
              className={inputCls}
            />
          </Field>
          <Field label="Banheiros">
            <input
              value={banheiros}
              onChange={(e) => setBanheiros(e.target.value)}
              inputMode="numeric"
              className={inputCls}
            />
          </Field>
          <Field label="Vagas">
            <input
              value={vagas}
              onChange={(e) => setVagas(e.target.value)}
              inputMode="numeric"
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Área principal (m²)">
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            inputMode="decimal"
            className={inputCls}
          />
        </Field>
        <button type="submit" disabled={createImovel.isPending} className={submitCls}>
          {createImovel.isPending ? "Salvando…" : "Salvar imóvel"}
        </button>
      </form>
    </FormSheet>
  );
}
