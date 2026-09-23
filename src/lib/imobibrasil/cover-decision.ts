/** Decide se a foto vai ao site marcada como destaque (capa). Nunca cria segunda capa. */
export function shouldSendAsCover(input: {
  readReliable: boolean;
  remoteHasCover: boolean;
  linkHasCover: boolean;
  coversSentThisRun: number;
  isFirstDesired: boolean;
}): boolean {
  if (!input.isFirstDesired || input.coversSentThisRun > 0) return false;
  if (input.readReliable) return !input.remoteHasCover;
  return !input.linkHasCover;
}
