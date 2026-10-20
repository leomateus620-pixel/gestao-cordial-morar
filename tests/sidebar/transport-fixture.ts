/** Somente a prévia importa este transporte. Não acessa serviços nem persiste dados. */
export const useServerFn = <T>(fn: T) => fn;
export const registerRentalContractDocument = async () => {
  throw new Error("Prévia visual: envio de documentos indisponível.");
};
export const supabase = {};
