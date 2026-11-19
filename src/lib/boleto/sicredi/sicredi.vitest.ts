import { beforeEach, describe, expect, it } from "vitest";
import { buildCadastroBody } from "./body";
import { sicrediCobranca } from "./cobranca.server";
import { readSicrediCredentials, SICREDI_SANDBOX_TEST_ACCOUNT, sicrediUrls, type SicrediCredentials } from "./config.server";
import { sicrediRequest, SicrediError, type FetchLike } from "./http.server";
import { formatLinhaDigitavel, isValidBarcode, isValidLinhaDigitavel, linhaToBarcode } from "./linha-digitavel";
import { boletoIdTituloEmpresa, boletoSeuNumero } from "./seu-numero";
import { clearSicrediTokenCache, getSicrediToken, sicrediUsername } from "./token.server";
import { normalizePagador } from "../rules";

// Synthetic credentials only (no real secret in tests).
const cred: SicrediCredentials = {
  brand: "cordial",
  ambiente: "producao",
  apiKey: "test-api-key",
  codigoBeneficiario: "12345",
  cooperativa: "6789",
  posto: "03",
  codigoAcesso: "codigo-teste",
};
const DOC_LINHA = "74891125110061420512803153351030188640000050000";
const DOC_BARRAS = "74891886400000500001125100614205120315335103";
type Call = { url: string; init: RequestInit };
function fakeFetch(handler: (url: string, init: RequestInit, n: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init = {}) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  return { f, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const tokenBody = (n = 1) => ({ access_token: `access-${n}`, refresh_token: `refresh-${n}`, expires_in: 300, refresh_expires_in: 1800 });

beforeEach(() => clearSicrediTokenCache());

describe("autenticação", () => {
  it("username = beneficiário (5) + cooperativa (4), form-urlencoded e headers fixos", async () => {
    const { f, calls } = fakeFetch(() => json(tokenBody()));
    expect(await getSicrediToken(cred, { fetchImpl: f })).toBe("access-1");
    expect(sicrediUsername(cred)).toBe("123456789");
    const h = calls[0].init.headers as Record<string, string>;
    expect(calls[0].url).toBe("https://api-parceiro.sicredi.com.br/auth/openapi/token");
    expect(h["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(h["x-api-key"]).toBe("test-api-key");
    expect(h.context).toBe("COBRANCA");
    const form = new URLSearchParams(String(calls[0].init.body));
    expect(form.get("grant_type")).toBe("password");
    expect(form.get("username")).toBe("123456789");
    expect(form.get("scope")).toBe("cobranca");
    expect(calls[0].init.redirect).toBe("manual");
  });
  it("sandbox usa /sb e nunca as credenciais de marca", () => {
    expect(sicrediUrls("sandbox").token).toBe("https://api-parceiro.sicredi.com.br/sb/auth/openapi/token");
    expect(sicrediUrls("sandbox").cobranca).toBe("https://api-parceiro.sicredi.com.br/sb/cobranca/boleto/v1");
    const r = readSicrediCredentials("cordial", "sandbox", {
      SICREDI_SANDBOX_API_KEY: "sb-key",
      SICREDI_CORDIAL_CODIGO_BENEFICIARIO: "99999",
      SICREDI_CORDIAL_COOPERATIVA: "1111",
    });
    expect(r.ok && r.credentials.codigoBeneficiario).toBe(SICREDI_SANDBOX_TEST_ACCOUNT.codigoBeneficiario);
    expect(r.ok && r.credentials.cooperativa).toBe("6789");
    expect(r.ok && r.credentials.posto).toBe("03");
  });
  it("reaproveita o token, renova por refresh perto da expiração e trava chamadas simultâneas", async () => {
    let now = 1_000_000;
    const { f, calls } = fakeFetch((_u, init, n) => {
      const g = new URLSearchParams(String(init.body)).get("grant_type");
      return json({ ...tokenBody(n), grant: g });
    });
    const [a, b] = await Promise.all([
      getSicrediToken(cred, { fetchImpl: f, now: () => now }),
      getSicrediToken(cred, { fetchImpl: f, now: () => now }),
    ]);
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
    now += 200_000; // 300 s - 60 s margin not reached yet
    await getSicrediToken(cred, { fetchImpl: f, now: () => now });
    expect(calls).toHaveLength(1);
    now += 50_000; // inside the 60 s margin
    await getSicrediToken(cred, { fetchImpl: f, now: () => now });
    expect(calls).toHaveLength(2);
    expect(new URLSearchParams(String(calls[1].init.body)).get("grant_type")).toBe("refresh_token");
  });
  it("refresh recusado volta para usuário e senha", async () => {
    let now = 0;
    const { f, calls } = fakeFetch((_u, init, n) =>
      new URLSearchParams(String(init.body)).get("grant_type") === "refresh_token" ? json({}, 401) : json(tokenBody(n)),
    );
    await getSicrediToken(cred, { fetchImpl: f, now: () => now });
    now += 280_000;
    await getSicrediToken(cred, { fetchImpl: f, now: () => now });
    expect(calls.map((c) => new URLSearchParams(String(c.init.body)).get("grant_type"))).toEqual([
      "password",
      "refresh_token",
      "password",
    ]);
  });
});

describe("erros e limites", () => {
  const req = (f: FetchLike, method: "GET" | "POST" = "GET") =>
    sicrediRequest({ fetchImpl: f, op: "testar", method, url: "https://x", headers: {}, sleepImpl: async () => undefined });
  it.each([
    [400, "recusou os dados"],
    [401, "Autenticação recusada"],
    [404, "Não encontrado"],
    [422, "não aceitou"],
    [503, "indisponível"],
  ])("HTTP %i vira mensagem clara em português", async (status, text) => {
    const { f } = fakeFetch(() => json({ message: "detalhe 12345678909" }, status));
    const err = await req(f).catch((e) => e);
    expect(err).toBeInstanceOf(SicrediError);
    expect(err.message).toContain(text);
    expect(err.message).not.toContain("12345678909");
    expect(err.incerto).toBe(status >= 500);
  });
  it("429 em GET espera e tenta de novo; em POST nunca repete", async () => {
    const get = fakeFetch((_u, _i, n) => (n === 1 ? json({}, 429) : json({ ok: true })));
    await expect(req(get.f)).resolves.toMatchObject({ status: 200 });
    expect(get.calls).toHaveLength(2);
    const post = fakeFetch(() => json({}, 429));
    await expect(req(post.f, "POST")).rejects.toThrow("429");
    expect(post.calls).toHaveLength(1);
  });
  it("timeout é incerto e redirecionamento é recusado", async () => {
    const slow: FetchLike = (_u, init) =>
      new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("x"), { name: "AbortError" }))));
    const err = await sicrediRequest({ fetchImpl: slow, op: "cadastrar", method: "POST", url: "https://x", headers: {}, timeoutMs: 20 }).catch((e) => e);
    expect(err.kind).toBe("timeout");
    expect(err.incerto).toBe(true);
    const { f } = fakeFetch(() => new Response(null, { status: 302, headers: { location: "https://evil" } }));
    await expect(req(f)).rejects.toMatchObject({ kind: "redirect" });
  });
});

describe("cobrança", () => {
  it("cadastro manda bearer, x-api-key, cooperativa e posto; consulta e PDF", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4 fake");
    const { f, calls } = fakeFetch((url) => {
      if (url.includes("/auth/")) return json(tokenBody());
      if (url.endsWith("/boletos")) return json({ nossoNumero: "251006142", linhaDigitavel: DOC_LINHA, codigoBarras: DOC_BARRAS }, 201);
      if (url.includes("/boletos/pdf")) return new Response(pdf, { status: 200 });
      return json({ situacao: "EM CARTEIRA", nossoNumero: "251006142" });
    });
    const client = sicrediCobranca(cred, { fetchImpl: f });
    const pag = normalizePagador({ nome: "Fulano", documento: "123.456.789-09", logradouro: "Rua A", numero: "1", cidade: "Santa Rosa", uf: "rs", cep: "98780-000" });
    if (!pag.ok) throw new Error("pagador");
    const body = buildCadastroBody({ codigoBeneficiario: "12345", seuNumero: "ABCDEFGH12", idTituloEmpresa: "ABCDEFGH12202611", vencimento: "2026-12-10", totalCentavos: 205000, pagador: pag.pagador, encargos: { ativo: false } });
    const r = await client.cadastrar(body);
    expect(r.nossoNumero).toBe("251006142");
    const post = calls.find((c) => c.url.endsWith("/boletos"))!;
    const h = post.init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer access-1");
    expect(h["x-api-key"]).toBe("test-api-key");
    expect(h.cooperativa).toBe("6789");
    expect(h.posto).toBe("03");
    expect(JSON.parse(String(post.init.body)).especieDocumento).toBe("RECIBO");
    expect((await client.consultar("251006142")).situacao).toBe("EM CARTEIRA");
    expect((await client.pdf(DOC_LINHA)).length).toBe(pdf.length);
  });
  it("PDF que não começa com %PDF- é recusado", async () => {
    const { f } = fakeFetch((url) => (url.includes("/auth/") ? json(tokenBody()) : new Response("<html>", { status: 200 })));
    await expect(sicrediCobranca(cred, { fetchImpl: f }).pdf(DOC_LINHA)).rejects.toThrow("PDF válido");
  });
  it("cadastro sem linha válida em produção é tratado como incerto", async () => {
    const { f } = fakeFetch((url) => (url.includes("/auth/") ? json(tokenBody()) : json({ nossoNumero: "1", linhaDigitavel: DOC_LINHA.replace(/0$/, "1"), codigoBarras: DOC_BARRAS }, 201)));
    const err = await sicrediCobranca(cred, { fetchImpl: f }).cadastrar(
      buildCadastroBody({ codigoBeneficiario: "12345", seuNumero: "ABCDEFGH12", idTituloEmpresa: "X", vencimento: "2026-12-10", totalCentavos: 100, pagador: { tipoPessoa: "PESSOA_FISICA", documento: "12345678909", nome: "A", endereco: "R", cidade: "C", uf: "RS", cep: "98780000" }, encargos: { ativo: false } }),
    ).catch((e) => e);
    expect(err.incerto).toBe(true);
  });
});

describe("linha digitável", () => {
  it("valida o exemplo oficial e recusa dígito alterado", () => {
    expect(isValidLinhaDigitavel(DOC_LINHA)).toBe(true);
    expect(isValidBarcode(DOC_BARRAS)).toBe(true);
    expect(linhaToBarcode(DOC_LINHA)).toBe(DOC_BARRAS);
    expect(isValidLinhaDigitavel(`${DOC_LINHA.slice(0, 9)}0${DOC_LINHA.slice(10)}`)).toBe(false);
    expect(isValidLinhaDigitavel(DOC_LINHA.slice(0, 46))).toBe(false);
    expect(formatLinhaDigitavel(DOC_LINHA)).toBe("74891.12511 00614.205128 03153.351030 1 88640000050000");
  });
});

describe("corpo do boleto", () => {
  const pagador = { tipoPessoa: "PESSOA_FISICA" as const, documento: "12345678909", nome: "A", endereco: "R", cidade: "C", uf: "RS", cep: "98780000" };
  const base = { codigoBeneficiario: "12345", seuNumero: "ABCDEFGH12", idTituloEmpresa: "ABCDEFGH12202611", vencimento: "2026-12-10", totalCentavos: 205000, pagador };
  it("NORMAL + RECIBO fixos e valor = total do inquilino", () => {
    const b = buildCadastroBody({ ...base, encargos: { ativo: false, juros: 1, multa: 2 } });
    expect(b.tipoCobranca).toBe("NORMAL");
    expect(b.especieDocumento).toBe("RECIBO");
    expect(b.valor).toBe(2050);
    expect(b).not.toHaveProperty("juros");
    expect(b).not.toHaveProperty("multa");
  });
  it("encargos ativos vão como instrução a partir do dia seguinte, sem somar no valor", () => {
    const b = buildCadastroBody({ ...base, encargos: { ativo: true, tipoJuros: "PERCENTUAL", tipoJurosPercentual: "MENSAL", juros: 1, tipoMulta: "PERCENTUAL", multa: 2 } });
    expect(b.valor).toBe(2050);
    expect(b.juros).toBe(1);
    expect(b.tipoJurosPercentual).toBe("MENSAL");
    expect(b.dataInicioJuros).toBe("2026-12-11");
    expect(b.multa).toBe(2);
    expect(b.dataInicioMulta).toBe("2026-12-11");
  });
  it("recusa total zero", () => {
    expect(() => buildCadastroBody({ ...base, totalCentavos: 0, encargos: { ativo: false } })).toThrow();
  });
});

describe("credenciais por marca", () => {
  it("Morar sem secrets fica não configurada e não usa os da Cordial", () => {
    const env = {
      SICREDI_CORDIAL_API_KEY: "k",
      SICREDI_CORDIAL_CODIGO_BENEFICIARIO: "12345",
      SICREDI_CORDIAL_COOPERATIVA: "6789",
      SICREDI_CORDIAL_POSTO: "3",
      SICREDI_CORDIAL_CODIGO_ACESSO: "x",
    };
    const morar = readSicrediCredentials("morar", "producao", env);
    expect(morar.ok).toBe(false);
    expect(!morar.ok && morar.missing).toContain("SICREDI_MORAR_API_KEY");
    const cordial = readSicrediCredentials("cordial", "producao", env);
    expect(cordial.ok && cordial.credentials.posto).toBe("03");
  });
  it("seuNumero tem 10 caracteres base36 e é determinístico", async () => {
    const a = await boletoSeuNumero("00000000-0000-4000-8000-0000000000aa", "2026-11", 1);
    expect(a).toMatch(/^[0-9A-Z]{10}$/);
    expect(a).toBe("D21VVM1WCU");
    expect(await boletoSeuNumero("00000000-0000-4000-8000-0000000000aa", "2026-11", 2)).not.toBe(a);
    expect(boletoIdTituloEmpresa(a, "2026-11")).toBe(`${a}202611`);
  });
});
