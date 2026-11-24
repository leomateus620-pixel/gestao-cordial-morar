/** Espelha a regra da migração 0113: bloqueia URL absoluta e `..` como pasta. */
export function isUnsafeStoragePath(path: string): boolean {
  return /^https?:/i.test(path) || /(^|\/)\.\.(\/|$)/.test(path);
}
