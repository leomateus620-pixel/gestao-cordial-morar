/**
 * Conversão de um atendimento em Fechamento para um registro real de Venda.
 * Idempotente: um atendimento só gera uma venda (índice único attendance_id).
 * Ao converter, o atendimento sai do funil (etapa arquivada, status fechado).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ConvertAttendanceToSaleInput = {
  attendanceId: string;
  saleValue: number;
  saleDate: string;
  paymentMethod: string;
  notes?: string | null;
};

type AttendanceRow = {
  id: string;
  imobiliaria: string;
  cliente_nome: string;
  telefone: string | null;
  email: string | null;
  imovel_id: string | null;
  imovel_descricao: string | null;
  imovel_endereco: string | null;
  imovel_bairro: string | null;
  imovel_cidade: string | null;
  imovel_tipo: string | null;
  imovel_valor: number | null;
  corretor_nome: string | null;
  pipeline_stage: string | null;
  venda_id: string | null;
};

export const convertAttendanceToSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ConvertAttendanceToSaleInput) => {
    if (!data.attendanceId) throw new Error("Atendimento inválido.");
    if (!Number.isFinite(data.saleValue) || data.saleValue <= 0)
      throw new Error("Informe o valor da venda.");
    if (!data.saleDate) throw new Error("Informe a data da venda.");
    return data;
  })
  .handler(async ({ data, context }): Promise<{ saleId: string; alreadyExisted: boolean }> => {
    const { data: attendance, error } = await context.supabase
      .from("attendances")
      .select(
        "id,imobiliaria,cliente_nome,telefone,email,imovel_id,imovel_descricao,imovel_endereco,imovel_bairro,imovel_cidade,imovel_tipo,imovel_valor,corretor_nome,pipeline_stage,venda_id",
      )
      .eq("id", data.attendanceId)
      .single();
    if (error) throw new Error(error.message);

    const row = attendance as unknown as AttendanceRow;
    if (row.venda_id) return { saleId: row.venda_id, alreadyExisted: true };
    if (row.pipeline_stage !== "fechamento")
      throw new Error("Só é possível importar para Vendas um atendimento na etapa Fechamento.");

    const payload = {
      user_id: context.userId,
      attendance_id: row.id,
      imobiliaria: row.imobiliaria,
      property_id: row.imovel_id,
      property_name: row.imovel_descricao ?? "Imóvel do atendimento",
      property_address: row.imovel_endereco ?? "",
      property_neighborhood: row.imovel_bairro,
      property_city_state: row.imovel_cidade,
      property_type: row.imovel_tipo ?? "Outro",
      previous_asking_price: row.imovel_valor,
      buyer_name: row.cliente_nome,
      buyer_phone: row.telefone,
      buyer_email: row.email,
      sale_value: data.saleValue,
      sale_date: data.saleDate,
      sale_status: "concluida",
      document_status: "contrato_pendente",
      payment_method: data.paymentMethod,
      responsible_agent: row.corretor_nome,
      notes: data.notes ?? null,
    };

    const { data: sale, error: saleError } = await context.supabase
      .from("real_estate_sales")
      .insert(payload as never)
      .select("id")
      .single();
    if (saleError) throw new Error(saleError.message);

    const saleId = (sale as unknown as { id: string }).id;

    const { error: linkError } = await context.supabase
      .from("attendances")
      .update({
        venda_id: saleId,
        status: "fechado",
        pipeline_stage: "arquivado",
      } as never)
      .eq("id", row.id);
    if (linkError) throw new Error(linkError.message);

    return { saleId, alreadyExisted: false };
  });
