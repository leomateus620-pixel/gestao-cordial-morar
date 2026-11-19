/** Pure builder of the Sicredi "Cadastrar Boleto" body. Browser-safe; no credentials here. */
import { addDays, type Encargos, type PagadorNormalizado } from "../rules";

export const SICREDI_TIPO_COBRANCA = "NORMAL" as const;
export const SICREDI_ESPECIE_DOCUMENTO = "RECIBO" as const;

export type CadastroBody = {
  codigoBeneficiario: string;
  tipoCobranca: typeof SICREDI_TIPO_COBRANCA;
  especieDocumento: typeof SICREDI_ESPECIE_DOCUMENTO;
  dataVencimento: string;
  valor: number;
  seuNumero: string;
  idTituloEmpresa: string;
  pagador: PagadorNormalizado;
  tipoJuros?: "VALOR" | "PERCENTUAL";
  tipoJurosPercentual?: "DIARIO" | "MENSAL";
  juros?: number;
  dataInicioJuros?: string;
  tipoMulta?: "VALOR" | "PERCENTUAL";
  multa?: number;
  dataInicioMulta?: string;
};

/**
 * `valor` is exactly the tenant total; charges are instructions to the bank (they start one
 * day after the due date) and are never added to the value. Inactive charges are omitted.
 */
export function buildCadastroBody(args: {
  codigoBeneficiario: string;
  seuNumero: string;
  idTituloEmpresa: string;
  vencimento: string;
  totalCentavos: number;
  pagador: PagadorNormalizado;
  encargos: Encargos;
}): CadastroBody {
  if (!Number.isInteger(args.totalCentavos) || args.totalCentavos <= 0)
    throw new Error("O total do boleto precisa ser maior que zero.");
  if (!/^\d{5}$/.test(args.codigoBeneficiario)) throw new Error("Código do beneficiário inválido.");
  if (!/^[0-9A-Z]{10}$/.test(args.seuNumero)) throw new Error("Seu número inválido.");
  if (args.idTituloEmpresa.length > 25) throw new Error("Identificador do título inválido.");
  const body: CadastroBody = {
    codigoBeneficiario: args.codigoBeneficiario,
    tipoCobranca: SICREDI_TIPO_COBRANCA,
    especieDocumento: SICREDI_ESPECIE_DOCUMENTO,
    dataVencimento: args.vencimento,
    valor: args.totalCentavos / 100,
    seuNumero: args.seuNumero,
    idTituloEmpresa: args.idTituloEmpresa,
    pagador: args.pagador,
  };
  const e = args.encargos;
  const inicio = addDays(args.vencimento, 1);
  if (e.ativo && (e.juros ?? 0) > 0) {
    body.tipoJuros = e.tipoJuros ?? "PERCENTUAL";
    if (body.tipoJuros === "PERCENTUAL") body.tipoJurosPercentual = e.tipoJurosPercentual ?? "MENSAL";
    body.juros = e.juros;
    body.dataInicioJuros = inicio;
  }
  if (e.ativo && (e.multa ?? 0) > 0) {
    body.tipoMulta = e.tipoMulta ?? "PERCENTUAL";
    body.multa = e.multa;
    body.dataInicioMulta = inicio;
  }
  return body;
}
