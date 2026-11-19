import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { boletoContractAccess } from "@/lib/boleto/rules";
import { buildBoletoPreview } from "@/lib/boleto/preview";
import { buildCadastroBody, pagadorParaEnvio, SANDBOX_PAGADOR } from "@/lib/boleto/sicredi/body";

const base = {
  admin: false,
  secretaria: false,
  metaReviewer: false,
  atendimentosViewer: false,
  agencies: [] as string[],
};

describe("acesso por contrato e marca", () => {
  it("admin emite em qualquer marca", () => {
    expect(boletoContractAccess({ ...base, admin: true }, "morar")).toBe(true);
    expect(boletoContractAccess({ ...base, admin: true }, "cordial")).toBe(true);
  });
  it("secretária emite em contrato da própria marca, mesmo sem tê-lo criado", () => {
    expect(
      boletoContractAccess({ ...base, secretaria: true, agencies: ["cordial"] }, "cordial"),
    ).toBe(true);
  });
  it("secretária de outra marca é negada", () => {
    expect(
      boletoContractAccess({ ...base, secretaria: true, agencies: ["cordial"] }, "morar"),
    ).toBe(false);
  });
  it("secretária sem marca vinculada é negada", () => {
    expect(boletoContractAccess({ ...base, secretaria: true }, "cordial")).toBe(false);
  });
  it("corretor/financeiro (sem papel) negados", () => {
    expect(boletoContractAccess({ ...base, agencies: ["cordial", "morar"] }, "cordial")).toBe(
      false,
    );
  });
  it("meta_reviewer e atendimentos_viewer bloqueados mesmo com admin", () => {
    expect(boletoContractAccess({ ...base, admin: true, metaReviewer: true }, "cordial")).toBe(
      false,
    );
    expect(
      boletoContractAccess({ ...base, admin: true, atendimentosViewer: true }, "cordial"),
    ).toBe(false);
  });
});

const tenant = {
  nome: "MARIA INQUILINA REAL",
  documento: "52998224725",
  logradouro: "Avenida Real",
  numero: "77",
  bairro: "Centro",
  cidade: "Ijui",
  uf: "RS",
  cep: "98700000",
};
function preview(ambiente: "sandbox" | "producao", pagador: Record<string, string> = tenant) {
  return buildBoletoPreview({
    contract: {
      id: "c1",
      brand: "cordial",
      status: "ativo",
      diaVencimento: 10,
      proximoVencimento: null,
      valorMensal: 1000,
      seguroValorMensal: 0,
    },
    pagador,
    tenantId: "t-real",
    competencia: "2099-01",
    today: "2098-12-01",
    account: { ambiente, encargos: { ativo: false } },
  });
}
const body = (
  snap: NonNullable<ReturnType<typeof preview>["snapshot"]>,
  ambiente: "sandbox" | "producao",
) =>
  JSON.stringify(
    buildCadastroBody({
      codigoBeneficiario: "12345",
      seuNumero: "ABCDEFGHIJ",
      idTituloEmpresa: "X",
      vencimento: snap.vencimento.data,
      totalCentavos: snap.total_centavos,
      pagador: pagadorParaEnvio(ambiente, snap.pagador),
      encargos: snap.encargos,
    }),
  );

describe("pagador fictício na homologação", () => {
  it("corpo da homologação nunca contém nome, documento ou endereço do inquilino", () => {
    const p = preview("sandbox");
    expect(p.pagadorFicticio).toBe(true);
    const b = body(p.snapshot!, "sandbox");
    for (const v of [
      "MARIA",
      "52998224725",
      "Avenida Real",
      "AVENIDA REAL",
      "98700000",
      "Ijui",
      "IJUI",
    ])
      expect(b).not.toContain(v);
    expect(b).toContain(SANDBOX_PAGADOR.documento);
    expect(p.snapshot!.pagador_referencia).toEqual({ tenantId: "t-real" });
  });
  it("mesmo um snapshot com dados reais é trocado no envio da homologação", () => {
    const prod = preview("producao").snapshot!;
    expect(body(prod, "sandbox")).not.toContain("52998224725");
  });
  it("corpo de produção contém o inquilino real", () => {
    const p = preview("producao");
    expect(p.pagadorFicticio).toBe(false);
    const b = body(p.snapshot!, "producao");
    expect(b).toContain("52998224725");
    expect(b).toContain("MARIA INQUILINA REAL");
  });
  it("CPF/CEP faltando: aviso na homologação, bloqueio em produção", () => {
    const sem = { ...tenant, documento: "", cep: "" };
    const s = preview("sandbox", sem);
    expect(s.ok).toBe(true);
    expect(s.avisos.length).toBeGreaterThan(0);
    const pr = preview("producao", sem);
    expect(pr.ok).toBe(false);
    expect(pr.pendencias.length).toBeGreaterThan(0);
  });
});

describe("migração 0102", () => {
  const sql = readFileSync("drizzle/migrations/0102_boleto_tighten_grants.sql", "utf8");
  it("retira tudo de anon e escrita/TRUNCATE de authenticated nas 4 tabelas", () => {
    expect(sql).toMatch(
      /REVOKE ALL ON public\.billing_accounts, public\.billing_account_events, public\.rental_boletos, public\.rental_boleto_events FROM anon/,
    );
    expect(sql).toMatch(/REVOKE ALL ON [^;]+rental_boleto_events FROM authenticated/);
    expect(sql).toMatch(/GRANT SELECT ON [^;]+ TO authenticated/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE|ALL)[^;]+TO authenticated/);
  });
  it("em rental_emissions só retira TRUNCATE do usuário logado", () => {
    expect(sql).toMatch(/REVOKE TRUNCATE ON public\.rental_emissions FROM authenticated/);
    expect(sql).not.toMatch(
      /REVOKE (INSERT|UPDATE|DELETE)[^;]*rental_emissions FROM authenticated/,
    );
  });
});
