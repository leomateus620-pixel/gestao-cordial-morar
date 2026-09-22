/**
 * Estado tri-valorado de um campo na alteração externa.
 *
 * O contrato da ImobiBrasil distingue duas coisas que o modelo local confundia:
 *  - campo AUSENTE do corpo  -> o site preserva o valor que já tem;
 *  - campo enviado VAZIO      -> o site limpa o valor.
 *
 * Por isso "não mexi nesse campo", "definiu o valor" (inclusive `0` e `false`)
 * e "quero limpar de propósito" precisam ser representados separadamente.
 *
 * Módulo puro, sem I/O.
 */

export type FieldState<T = string> =
  | { kind: "untouched" }
  | { kind: "set"; value: T }
  | { kind: "clear" };

export const UNTOUCHED: FieldState<never> = { kind: "untouched" };

export function untouched<T>(): FieldState<T> {
  return { kind: "untouched" } as FieldState<T>;
}

export function setValue<T>(value: T): FieldState<T> {
  return { kind: "set", value };
}

export function clearValue<T>(): FieldState<T> {
  return { kind: "clear" } as FieldState<T>;
}

export function isTouched<T>(state: FieldState<T>): boolean {
  return state.kind !== "untouched";
}

/** Texto a enviar: `undefined` quando o campo deve ficar fora do corpo. */
export function toPayloadValue<T>(
  state: FieldState<T>,
  render: (value: T) => string | string[] | undefined,
): string | string[] | undefined {
  if (state.kind === "untouched") return undefined;
  if (state.kind === "clear") return "";
  const rendered = render(state.value);
  // Valor definido que não tem representação válida não pode virar limpeza
  // silenciosa: fica fora do corpo.
  return rendered === undefined ? undefined : rendered;
}

/**
 * Traduz um valor local em estado, sabendo se o campo foi tocado pelo usuário.
 * `zeroIsValue` marca contagens (dormitórios, vagas) em que `0` é informação,
 * não ausência. Dinheiro e área usam `0`/vazio como limpeza intencional.
 */
export function stateFromLocal(
  touched: boolean,
  value: unknown,
  options: { zeroIsValue?: boolean } = {},
): FieldState<string> {
  if (!touched) return untouched();
  if (value === null || value === undefined) return clearValue();
  if (typeof value === "boolean") return setValue(value ? "sim" : "nao");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return untouched();
    if (value === 0 && !options.zeroIsValue) return clearValue();
    return setValue(String(value));
  }
  const text = String(value).trim();
  return text ? setValue(text) : clearValue();
}
