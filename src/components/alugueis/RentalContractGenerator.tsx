import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RentalContractFull } from "@/types/rental";
import {
  fillContract,
  insurersForBrand,
  missingFields,
  qualify,
  type ContractBrand,
  type ContractGuarantee,
  type ContractInsurer,
} from "@/lib/rentals/contract-generator";
import { CONTRACT_TEMPLATES } from "@/lib/rentals/contract-templates";
import { contractTextToDocx } from "@/lib/rentals/contract-docx";
import { useRentalDocuments } from "@/hooks/useRentalDocuments";

const GUARANTEE_LABEL: Record<ContractGuarantee, string> = {
  fiador: "Fiador",
  caucao: "Caução",
  seguro_fianca: "Seguro-fiança",
};

function propertyAddress(c: RentalContractFull): string {
  const p = c.property;
  return [
    [p.logradouro, p.numero ? `n° ${p.numero}` : null, p.complemento].filter(Boolean).join(", "),
    p.bairro ? `bairro ${p.bairro}` : null,
    p.cidade ? `na cidade de ${p.cidade}${p.uf ? `, ${p.uf}` : ""}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

const toNum = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function RentalContractGenerator({ contract }: { contract: RentalContractFull }) {
  const [open, setOpen] = useState(false);
  const insurersQ = useQuery({
    queryKey: ["rental-insurers", "contract"],
    enabled: open,
    queryFn: async (): Promise<ContractInsurer[]> => {
      const { data, error } = await supabase
        .from("rental_insurers")
        .select("id,nome,brands,clause_template,active")
        .order("nome");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id,
        nome: r.nome,
        brands: r.brands as string[],
        clauseTemplate: r.clause_template,
        active: r.active,
      }));
    },
  });

  const primary = contract.guarantees[0];
  const initialGuarantee: ContractGuarantee =
    primary?.tipo ?? (contract.garantiaTipo !== "sem_garantia" ? contract.garantiaTipo : "fiador");
  const [brand, setBrand] = useState<ContractBrand>(
    contract.brand === "morar" ? "morar" : "cordial",
  );
  const [guarantee, setGuarantee] = useState<ContractGuarantee>(initialGuarantee);
  const [insurerId, setInsurerId] = useState("");
  const [locador, setLocador] = useState("");
  const [locatarios, setLocatarios] = useState<string[]>([]);
  const [fiadores, setFiadores] = useState<string[]>([]);
  const [endereco, setEndereco] = useState("");
  const [matricula, setMatricula] = useState("");
  const [bens, setBens] = useState("");
  const [aluguel, setAluguel] = useState("");
  const [caucao, setCaucao] = useState("");
  const [seguroMensal, setSeguroMensal] = useState("");
  const [parcelas, setParcelas] = useState("12");
  const [dataAssinatura, setDataAssinatura] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLocador(
      qualify({
        nome: contract.property.proprietarioNome,
        cpfCnpj: contract.property.proprietarioCpf,
      }),
    );
    const tenants = contract.tenants.length ? contract.tenants : [contract.tenant];
    setLocatarios(tenants.map((t) => qualify(t)));
    setFiadores(
      contract.guarantees
        .filter((g) => g.tipo === "fiador" && g.guarantor)
        .map((g) => qualify(g.guarantor!)),
    );
    setEndereco(propertyAddress(contract));
    setAluguel(String(contract.valorMensal).replace(".", ","));
    const cau =
      contract.guarantees.find((g) => g.tipo === "caucao")?.valorCaucao ?? contract.valorCaucao;
    setCaucao(cau ? String(cau).replace(".", ",") : "");
    const seg = contract.guarantees.find((g) => g.tipo === "seguro_fianca");
    setSeguroMensal(seg?.seguroValorMensal ? String(seg.seguroValorMensal).replace(".", ",") : "");
  }, [open, contract]);

  const available = useMemo(
    () => insurersForBrand(insurersQ.data ?? [], brand),
    [insurersQ.data, brand],
  );
  useEffect(() => {
    if (insurerId && available.some((i) => i.id === insurerId)) return;
    const name =
      contract.guarantees
        .find((g) => g.tipo === "seguro_fianca")
        ?.seguroSeguradora?.toLowerCase() ?? "";
    setInsurerId(available.find((i) => name && name.includes(i.nome.toLowerCase()))?.id ?? "");
  }, [available, insurerId, contract.guarantees]);

  const text = useMemo(
    () =>
      fillContract(CONTRACT_TEMPLATES[`${brand}-${guarantee}`], {
        brand,
        guarantee,
        locador: { label: "Locador", qualificacao: locador },
        locatarios: locatarios.map((q) => ({ label: "Locatário", qualificacao: q })),
        fiadores:
          guarantee === "fiador" ? fiadores.map((q) => ({ label: "Fiador", qualificacao: q })) : [],
        imovelEndereco: endereco,
        matricula,
        bensFiadores: bens,
        dataInicio: contract.dataInicio,
        dataAssinatura,
        valorAluguel: toNum(aluguel),
        valorCaucao: toNum(caucao),
        insurer: available.find((i) => i.id === insurerId) ?? null,
        seguroValorMensal: toNum(seguroMensal),
        seguroParcelas: Math.max(1, Number(parcelas) || 12),
      }),
    [
      brand,
      guarantee,
      locador,
      locatarios,
      fiadores,
      endereco,
      matricula,
      bens,
      contract.dataInicio,
      dataAssinatura,
      aluguel,
      caucao,
      available,
      insurerId,
      seguroMensal,
      parcelas,
    ],
  );
  const missing = missingFields(text);
  const { uploadFile } = useRentalDocuments(contract.id);

  async function download() {
    if (missing.length) return;
    setBusy(true);
    try {
      const blob = await contractTextToDocx(text);
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", "h");
      const fileName = `Contrato gerado (nao assinado) - ${brand} - ${GUARANTEE_LABEL[guarantee]} - ${stamp}.docx`;
      const docxType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      try {
        await uploadFile(new File([blob], fileName, { type: docxType }), "contrato_aluguel");
      } catch {
        toast.error("O arquivo foi gerado, mas não consegui anexar ao aluguel. Baixe e anexe manualmente.");
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Contrato de locação - ${GUARANTEE_LABEL[guarantee]} - ${contract.tenant.nome}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Contrato gerado e anexado aos documentos do aluguel. Revise no Word antes de enviar para assinatura.");
    } catch {
      toast.error("Não foi possível gerar o arquivo. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const field = "space-y-1.5";
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
        <FileText className="h-4 w-4" /> Gerar contrato
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gerar contrato de locação</DialogTitle>
            <DialogDescription>
              Confira os dados. O que estiver marcado como “PREENCHER” precisa ser completado antes
              de baixar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className={field}>
                  <Label>Modelo da imobiliária</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value as ContractBrand)}
                    disabled={contract.brand !== "ambas"}
                  >
                    <option value="cordial">Cordial</option>
                    <option value="morar">Morar</option>
                  </select>
                </div>
                <div className={field}>
                  <Label>Garantia</Label>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={guarantee}
                    onChange={(e) => setGuarantee(e.target.value as ContractGuarantee)}
                  >
                    {(Object.keys(GUARANTEE_LABEL) as ContractGuarantee[]).map((g) => (
                      <option key={g} value={g}>
                        {GUARANTEE_LABEL[g]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {guarantee === "seguro_fianca" && (
                <div className="grid grid-cols-3 gap-3">
                  <div className={`${field} col-span-3`}>
                    <Label>Seguradora contratada pelo inquilino</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                      value={insurerId}
                      onChange={(e) => setInsurerId(e.target.value)}
                    >
                      <option value="">Escolha…</option>
                      {available.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={field}>
                    <Label>Valor mensal do seguro (R$)</Label>
                    <Input
                      inputMode="decimal"
                      value={seguroMensal}
                      onChange={(e) => setSeguroMensal(e.target.value)}
                    />
                  </div>
                  <div className={field}>
                    <Label>Parcelas</Label>
                    <Input
                      inputMode="numeric"
                      value={parcelas}
                      onChange={(e) => setParcelas(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className={field}>
                  <Label>Aluguel (R$)</Label>
                  <Input
                    inputMode="decimal"
                    value={aluguel}
                    onChange={(e) => setAluguel(e.target.value)}
                  />
                </div>
                {guarantee === "caucao" && (
                  <div className={field}>
                    <Label>Caução (R$)</Label>
                    <Input
                      inputMode="decimal"
                      value={caucao}
                      onChange={(e) => setCaucao(e.target.value)}
                    />
                  </div>
                )}
                <div className={field}>
                  <Label>Data da assinatura</Label>
                  <Input
                    type="date"
                    value={dataAssinatura}
                    onChange={(e) => setDataAssinatura(e.target.value)}
                  />
                </div>
                <div className={field}>
                  <Label>Matrícula do imóvel</Label>
                  <Input value={matricula} onChange={(e) => setMatricula(e.target.value)} />
                </div>
              </div>
              <div className={field}>
                <Label>Endereço do imóvel</Label>
                <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} />
              </div>
              <div className={field}>
                <Label>Locador(a)</Label>
                <Textarea rows={3} value={locador} onChange={(e) => setLocador(e.target.value)} />
              </div>
              {locatarios.map((q, i) => (
                <div key={`t${i}`} className={field}>
                  <Label>Locatário(a) {locatarios.length > 1 ? i + 1 : ""}</Label>
                  <Textarea
                    rows={3}
                    value={q}
                    onChange={(e) =>
                      setLocatarios((l) => l.map((x, j) => (j === i ? e.target.value : x)))
                    }
                  />
                </div>
              ))}
              {guarantee === "fiador" && (
                <>
                  {fiadores.map((q, i) => (
                    <div key={`f${i}`} className={field}>
                      <Label>Fiador(a) {i + 1}</Label>
                      <Textarea
                        rows={3}
                        value={q}
                        onChange={(e) =>
                          setFiadores((l) => l.map((x, j) => (j === i ? e.target.value : x)))
                        }
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiadores((l) => [...l, qualify({})])}
                  >
                    + Adicionar fiador
                  </Button>
                  <div className={field}>
                    <Label>Bens oferecidos pelos fiadores</Label>
                    <Textarea
                      rows={3}
                      value={bens}
                      onChange={(e) => setBens(e.target.value)}
                      placeholder="a) Imóvel de Matrícula nº …"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="space-y-3">
              {missing.length > 0 ? (
                <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <p className="font-medium">Falta preencher:</p>
                    <p className="text-muted-foreground">{missing.join(", ")}</p>
                  </div>
                </div>
              ) : (
                <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                  Tudo preenchido. Revise a prévia e baixe o contrato.
                </p>
              )}
              <div
                className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-card p-4 text-xs leading-relaxed"
                data-testid="contract-preview"
              >
                {text}
              </div>
              <Button
                className="w-full gap-2"
                disabled={missing.length > 0 || busy}
                onClick={download}
              >
                <Download className="h-4 w-4" /> Baixar contrato (Word)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
