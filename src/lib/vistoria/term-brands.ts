import { SITE_PUBLIC_HOSTS } from "../cordial-site/domains";

const closing =
  "E, por estarem assim justas e acordadas, as partes assinam o presente Termo de Vistoria de Entrada em 03 (três) vias de igual teor e forma, na presença das testemunhas abaixo.";
const entry = (address: string) => [
  `Pelo presente instrumento, as partes acima qualificadas declaram que nesta data vistoriaram o imóvel residencial situado na ${address}, tendo-o encontrado conforme descrito no relatório e nas condições dos ambientes que seguem abaixo, as quais passam a integrar o presente termo para todos os fins de direito.`,
  "Finda ou rescindida a locação, o LOCATÁRIO se obriga a restituir o imóvel no estado em que o recebeu, observadas as condições descritas neste termo de vistoria, salvo as deteriorações decorrentes do uso normal e habitual do imóvel.",
];
export const TERM_BRANDS = {
  cordial: {
    name: "Cordial Imóveis",
    logo: "cordial" as const,
    logoWidth: 146,
    address: "Rua Buriti, n° 139 - Centro | Santa Rosa/RS",
    website: "www." + SITE_PUBLIC_HOSTS.cordial,
    printWebsite: true,
    footerColor: [0.14, 0.14, 0.14] as const,
    entry,
    closing,
  },
  morar: {
    name: "Morar Imóveis",
    logo: "morar" as const,
    logoWidth: 156,
    address: "Rua Buriti, nº 139 - Centro | Santa Rosa/RS",
    website: SITE_PUBLIC_HOSTS.morar,
    printWebsite: false,
    footerColor: [0.54, 0.28, 0.08] as const,
    entry: (address: string) => [
      ...entry(address),
      "CLÁUSULA 1ª – O LOCATÁRIO terá o prazo de 10 (dez) dias corridos, contados do recebimento das chaves, para conferir os itens descritos neste termo e apresentar, por escrito, eventuais divergências ou vícios não registrados, acompanhados de fotos. Não havendo manifestação nesse prazo, o presente termo será considerado aceito em sua integralidade. Vícios ocultos, que não podiam ser percebidos na conferência, poderão ser comunicados assim que constatados.",
    ],
    closing,
  },
};
