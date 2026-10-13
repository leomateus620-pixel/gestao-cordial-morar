export type BoletoInput = {
  contractId: string;
  competencia: string;
  valor: number;
  vencimento: string;
};
export interface BoletoProvider {
  createBoleto(input: BoletoInput): Promise<{
    id: string;
    pdfUrl: string;
    linhaDigitavel: string;
    pixCopiaECola?: string;
    vencimento: string;
  }>;
}
// No payment provider is configured. Never substitute a simulated financial document.
export const boletoProvider: BoletoProvider | null = null;
