/**
 * Real Sicredi SANDBOX smoke (opt-in): token → cadastro → consulta → PDF (+ liquidados/dia).
 * Uses only SICREDI_SANDBOX_API_KEY and the public test data from the manual. Prints booleans,
 * statuses and shapes only — never tokens, keys or full documents.
 * Run: SICREDI_RUN_SANDBOX_SMOKE=true bunx tsx tests/boleto/sandbox-smoke.ts
 */
import { readSicrediCredentials } from "../../src/lib/boleto/sicredi/config.server";
import { sicrediCobranca } from "../../src/lib/boleto/sicredi/cobranca.server";
import { getSicrediToken } from "../../src/lib/boleto/sicredi/token.server";
import { buildCadastroBody } from "../../src/lib/boleto/sicredi/body";
import { boletoIdTituloEmpresa, boletoSeuNumero } from "../../src/lib/boleto/sicredi/seu-numero";
import {
  addDays,
  lastBusinessDay,
  normalizePagador,
  todaySaoPaulo,
} from "../../src/lib/boleto/rules";
import { SicrediError } from "../../src/lib/boleto/sicredi/http.server";

if (process.env.SICREDI_RUN_SANDBOX_SMOKE !== "true") {
  console.log(JSON.stringify({ skipped: true }));
  process.exit(0);
}
const out: Record<string, unknown> = { ambiente: "sandbox" };
const step = async (name: string, fn: () => Promise<unknown>) => {
  try {
    out[name] = { ok: true, ...((await fn()) as object) };
    return true;
  } catch (e) {
    out[name] = {
      ok: false,
      status: e instanceof SicrediError ? e.status : null,
      kind: e instanceof SicrediError ? e.kind : "erro",
      message: e instanceof Error ? e.message : "erro",
    };
    return false;
  }
};
const cred = readSicrediCredentials("cordial", "sandbox");
if (!cred.ok) {
  console.log(JSON.stringify({ ok: false, missing: cred.missing }));
  process.exit(1);
}
const c = cred.credentials;
const client = sicrediCobranca(c);
const today = todaySaoPaulo();
let linha = "";
let nosso = "";
await step("token", async () => ({ tokenRecebido: (await getSicrediToken(c)).length > 20 }));
await step("liquidadosDia", async () => {
  const r = await client.liquidadosDia(lastBusinessDay(today));
  return { itens: r.items.length, hasNext: r.hasNext };
});
const seu = await boletoSeuNumero(
  "00000000-0000-4000-8000-0000000000aa",
  today.slice(0, 7),
  (Date.now() % 90) + 1,
);
const pag = normalizePagador({
  nome: "JOAO DA SILVA",
  documento: "12345678909",
  logradouro: "Rua Teste",
  numero: "1",
  cidade: "Santa Rosa",
  uf: "RS",
  cep: "98780000",
});
if (!pag.ok) throw new Error("pagador");
const body = buildCadastroBody({
  codigoBeneficiario: c.codigoBeneficiario,
  seuNumero: seu,
  idTituloEmpresa: boletoIdTituloEmpresa(seu, today.slice(0, 7)),
  vencimento: addDays(today, 10),
  totalCentavos: 205000,
  pagador: pag.pagador,
  encargos: { ativo: false },
});
await step("cadastro", async () => {
  const r = await client.cadastrar(body);
  linha = r.linhaDigitavel;
  nosso = r.nossoNumero;
  return {
    nossoNumero9: /^\d{9}$/.test(r.nossoNumero),
    linha47: r.linhaDigitavel.length === 47,
    barras44: r.codigoBarras.length === 44,
  };
});
if (nosso)
  await step("consulta", async () => {
    const r = await client.consultar(nosso);
    return { situacao: r.situacao, temNossoNumero: Boolean(r.nossoNumero) };
  });
await step("cadastrados", async () => ({ encontrados: (await client.cadastrados(seu)).length }));
if (linha)
  await step("pdf", async () => {
    const b = await client.pdf(linha);
    return { pdf: true, kb: Math.round(b.length / 1024) };
  });
out.ok = ["token", "cadastro", "consulta", "pdf"].every(
  (k) => (out[k] as { ok?: boolean } | undefined)?.ok,
);
console.log(JSON.stringify(out, null, 1));
