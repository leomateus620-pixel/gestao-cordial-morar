/** Regras puras de ver/baixar/compartilhar a NFS-e na ficha do aluguel. */
export type NfseDocActions = { view: boolean; download: boolean; share: boolean; testBanner: boolean };

export function nfseDocActions(row: { modoTeste: boolean; pdfStatus?: string | null }): NfseDocActions {
  if (row.modoTeste) return { view: false, download: false, share: false, testBanner: true };
  const saved = row.pdfStatus === "salvo";
  return { view: saved, download: saved, share: saved, testBanner: false };
}

/** Texto para compartilhar: sempre o link oficial de autenticidade, nunca o link temporário. */
export function nfseShareText(input: { fileName: string; officialLink: string | null }): string {
  const title = input.fileName.replace(/\.pdf$/i, "");
  return input.officialLink ? `${title}\nAutenticidade: ${input.officialLink}` : title;
}

export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
