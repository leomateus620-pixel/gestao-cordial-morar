/** Contact details stay on the permission-checked record screen. */
export function maskCpf(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 ? `***.***.***-${digits.slice(-2)}` : "[documento oculto]";
}
export function maskPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 ? `(**) *****-${digits.slice(-4)}` : "[telefone oculto]";
}
export function maskEmail(value: string | null | undefined): string {
  if (!value) return "";
  const [local, domain] = value.split("@");
  if (!domain) return "[e-mail oculto]";
  const suffix = domain.includes(".") ? `.${domain.split(".").at(-1)}` : "";
  return `${Array.from(local ?? "")[0] || "*"}***@***${suffix}`;
}
export function maskText(value: string): string {
  return value
    .replace(
      /[\p{L}\p{N}\p{M}\p{S}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}](?:[\p{L}\p{N}\p{M}.-]*[\p{L}\p{N}\p{M}])?\.[\p{L}\p{N}\p{M}-]{2,}/giu,
      maskEmail,
    )
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, maskCpf)
    .replace(
      /(?<![\w-])(?:\+?55[\s.-]?)?(?:\(\d{2}\)|\d{2})[\s.-]?(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}(?![\w-])/g,
      maskPhone,
    )
    .replace(/(?<![\w*-])\d{4,5}[- .]\d{4}(?![\w-])/g, maskPhone);
}
export function maskAgentOutput<T>(value: T): T {
  if (typeof value === "string") return maskText(value) as T;
  if (Array.isArray(value)) return value.map(maskAgentOutput) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (typeof item === "string" && /^(cpf|cpf_cnpj|document|documento)$/i.test(key))
          return [key, maskCpf(item)];
        if (typeof item === "string" && /^(phone|telefone|whatsapp)$/i.test(key))
          return [key, maskPhone(item)];
        if (typeof item === "string" && /^(email|e_mail)$/i.test(key))
          return [key, maskEmail(item)];
        return [key, maskAgentOutput(item)];
      }),
    ) as T;
  }
  return value;
}
