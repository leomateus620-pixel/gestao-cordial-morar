/** Server-only read-only connection test: token + "liquidados/dia" of the last business day. */
import { lastBusinessDay, todaySaoPaulo } from "./rules";
import { sicrediCobranca } from "./sicredi/cobranca.server";
import type { SicrediCredentials } from "./sicredi/config.server";
import { SicrediError, type FetchLike } from "./sicredi/http.server";
import { forgetSicrediToken, getSicrediToken } from "./sicredi/token.server";

export type ConnectionResult = {
  tokenOk: boolean;
  consultaOk: boolean;
  mensagem: string;
  status: number | null;
};

export async function testSicrediConnection(
  c: SicrediCredentials,
  deps: { fetchImpl?: FetchLike; today?: string } = {},
): Promise<ConnectionResult> {
  await forgetSicrediToken(c);
  try {
    await getSicrediToken(c, { fetchImpl: deps.fetchImpl });
  } catch (e) {
    return {
      tokenOk: false,
      consultaOk: false,
      status: e instanceof SicrediError ? e.status : null,
      mensagem:
        e instanceof SicrediError && (e.status === 401 || e.status === 403)
          ? `Chave ou código de acesso recusado pelo Sicredi (HTTP ${e.status}). Nada foi liberado.`
          : e instanceof SicrediError
            ? e.message
            : "Falha inesperada na autenticação.",
    };
  }
  try {
    await sicrediCobranca(c, { fetchImpl: deps.fetchImpl }).liquidadosDia(
      lastBusinessDay(deps.today ?? todaySaoPaulo()),
      0,
    );
    return {
      tokenOk: true,
      consultaOk: true,
      status: 200,
      mensagem:
        "Token e consulta OK. Isso não libera emissão: a liberação é uma decisão do administrador.",
    };
  } catch (e) {
    return {
      tokenOk: true,
      consultaOk: false,
      status: e instanceof SicrediError ? e.status : null,
      mensagem: `Token OK, mas a consulta falhou: ${e instanceof SicrediError ? e.message : "falha inesperada."}`,
    };
  }
}
