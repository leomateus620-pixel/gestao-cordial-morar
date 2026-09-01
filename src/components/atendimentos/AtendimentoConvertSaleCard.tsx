/**
 * Card de conversão: atendimento em Fechamento vira uma Venda real.
 * Após converter, o atendimento sai do funil e o usuário segue no menu Vendas
 * para anexar contratos.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Handshake, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { convertAttendanceToSale } from "@/lib/sales/convert.functions";
import type { Atendimento } from "@/types/atendimento";
import { useSession } from "@/lib/auth-mock";
import { canAccessModule } from "@/lib/access-control";

const inputClass =
  "min-h-10 w-full rounded-xl border border-stone-900/12 bg-white px-3 text-sm text-stone-900 outline-none focus:border-teal-700";

export function AtendimentoConvertSaleCard({ atendimento }: { atendimento: Atendimento }) {
  const convert = useServerFn(convertAttendanceToSale);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [valor, setValor] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [pagamento, setPagamento] = useState("Financiamento");
  const [saving, setSaving] = useState(false);
  const session = useSession();

  if (atendimento.pipelineStage !== "fechamento") return null;
  // Sem acesso ao menu Vendas a conversão levaria a uma rota bloqueada.
  if (!canAccessModule(session, "vendas")) return null;

  async function handleConvert() {
    const parsed = Number(valor.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Informe o valor da venda.");
      return;
    }
    setSaving(true);
    try {
      const result = await convert({
        data: {
          attendanceId: atendimento.id,
          saleValue: parsed,
          saleDate: data,
          paymentMethod: pagamento,
        },
      });
      await queryClient.invalidateQueries();
      toast.success(
        result.alreadyExisted
          ? "Este atendimento já tinha uma venda vinculada."
          : "Venda criada. Anexe os contratos no menu Vendas.",
      );
      void navigate({ to: "/vendas" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao importar para Vendas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[1.4rem] border border-teal-800/20 bg-teal-50/60 p-3">
      <h3 className="flex items-center gap-2 text-sm font-extrabold text-stone-900">
        <Handshake className="size-4" /> Venda concluída? Importar para Vendas
      </h3>
      <p className="mt-1 text-xs leading-5 text-stone-600">
        Cria o registro no menu Vendas com os dados deste atendimento e retira o cliente do funil de
        fechamento. Os contratos são anexados na ficha da venda.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <input
          value={valor}
          onChange={(event) => setValor(event.target.value)}
          placeholder="Valor da venda (R$)"
          inputMode="decimal"
          className={inputClass}
        />
        <input
          type="date"
          value={data}
          onChange={(event) => setData(event.target.value)}
          className={inputClass}
        />
        <select
          value={pagamento}
          onChange={(event) => setPagamento(event.target.value)}
          className={inputClass}
        >
          {["À vista", "Financiamento", "Consórcio", "Permuta", "Parcelado", "Outro"].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={saving}
        onClick={() => void handleConvert()}
        className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 text-sm font-extrabold text-white disabled:opacity-60"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Handshake className="size-4" />}
        Importar para Vendas
      </button>
    </section>
  );
}
