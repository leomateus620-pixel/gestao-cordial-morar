import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FormSheet, Field, inputCls, submitCls } from "./form-shell";
// store legacy não é mais usado aqui — cadastro persiste no Supabase
import { createClient } from "@/lib/clients/clients.functions";
import { CLIENTS_QUERY_KEY } from "@/hooks/useClients";
import type { AgencyId, Cliente } from "@/lib/mock/data";
import type { ClientCreateInput } from "@/types/client";

export function NovoClienteSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: ClientCreateInput) => createClient({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY }),
  });

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [tipo, setTipo] = useState<Cliente["tipo"]>("Comprador");
  const [interesse, setInteresse] = useState("");
  const [orcamento, setOrcamento] = useState(0);
  const [imobiliaria, setImobiliaria] = useState<AgencyId>("cordial");
  const [origem, setOrigem] = useState<Cliente["origem"]>("WhatsApp");
  const [documento, setDocumento] = useState("");
  const [rendaMensal, setRendaMensal] = useState(0);
  const [preferenciaContato, setPreferenciaContato] =
    useState<Cliente["preferenciaContato"]>("WhatsApp");
  const [observacoes, setObservacoes] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    try {
      await mutation.mutateAsync({
        fullName: nome,
        phone: telefone,
        email,
        clientType: mapTipo(tipo),
        contactPreference: mapPreferencia(preferenciaContato),
        leadOrigin: mapOrigem(origem),
        brand: imobiliaria,
        purpose: tipo === "Locatário" ? "aluguel" : "compra",
        propertyType: "apartamento",
        bedrooms: "nao_aplica",
        minBudget: orcamento || undefined,
        maxBudget: orcamento || undefined,
        approximateIncome: rendaMensal || undefined,
        document: documento,
        notes: observacoes || interesse,
        status: "novo",
      });
      toast.success(`Cadastro de ${nome} salvo.`);
      onOpenChange(false);
      setNome("");
      setTelefone("");
      setEmail("");
      setInteresse("");
      setOrcamento(0);
      setDocumento("");
      setRendaMensal(0);
      setObservacoes("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o cliente.");
    }
  }

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title="Novo cliente">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nome completo">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className={inputCls}
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Telefone">
            <input
              value={telefone}
              onChange={(e) => setTelefone(e.target.value)}
              className={inputCls}
              placeholder="(11) 9..."
            />
          </Field>
          <Field label="Tipo">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as Cliente["tipo"])}
              className={inputCls}
            >
              {(["Comprador", "Locatário", "Vendedor", "Proprietário"] as const).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="E-mail">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="CPF/CNPJ">
            <input
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Origem">
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value as Cliente["origem"])}
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
        <Field label="Interesse">
          <input
            value={interesse}
            onChange={(e) => setInteresse(e.target.value)}
            className={inputCls}
            placeholder="Apto 2 quartos Jardins"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Orçamento (R$)">
            <input
              type="number"
              value={orcamento || ""}
              onChange={(e) => setOrcamento(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
          <Field label="Renda (R$)">
            <input
              type="number"
              value={rendaMensal || ""}
              onChange={(e) => setRendaMensal(Number(e.target.value))}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contato preferencial">
            <select
              value={preferenciaContato}
              onChange={(e) =>
                setPreferenciaContato(e.target.value as Cliente["preferenciaContato"])
              }
              className={inputCls}
            >
              <option>WhatsApp</option>
              <option>Telefone</option>
              <option>E-mail</option>
            </select>
          </Field>
          <Field label="Imobiliária">
            <select
              value={imobiliaria}
              onChange={(e) => setImobiliaria(e.target.value as AgencyId)}
              className={inputCls}
            >
              <option value="cordial">Cordial Imóveis</option>
              <option value="morar">Morar Imóveis</option>
            </select>
          </Field>
        </div>
        <Field label="Observações">
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className={inputCls}
            placeholder="Preferências, restrições e próximos passos..."
          />
        </Field>
        <button type="submit" disabled={mutation.isPending} className={submitCls}>
          {mutation.isPending ? "Salvando..." : "Cadastrar cliente"}
        </button>
      </form>
    </FormSheet>
  );
}

function mapTipo(tipo: Cliente["tipo"]) {
  if (tipo === "Locatário") return "locatario";
  if (tipo === "Proprietário") return "proprietario";
  return "comprador";
}

function mapPreferencia(preferencia: Cliente["preferenciaContato"]) {
  if (preferencia === "Telefone") return "ligacao";
  if (preferencia === "E-mail") return "email";
  return "whatsapp";
}

function mapOrigem(origem: Cliente["origem"]) {
  if (origem === "Instagram") return "instagram";
  if (origem === "Indicação") return "indicacao";
  if (origem === "Site") return "site";
  return "whatsapp";
}


