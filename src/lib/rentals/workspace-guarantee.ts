/** Pessoa da garantia no payload da conferência: presente só quando existe fiador. */
export function guaranteePerson<T extends object>(person: T | undefined | null): { person?: T } {
  return person ? { person } : {};
}
