import type { ContractBrand } from "./contract-generator";

const LETTERHEADS = {
  cordial: {
    name: "Cordial Imóveis",
    address: "Rua Buriti, nº 139, Centro · Santa Rosa/RS · CEP 98780-753",
    logo: "/cordial-site/logo-petroleo.png",
    type: "png",
    width: 691,
    height: 231,
  },
  morar: {
    name: "Morar Imóveis",
    // Endereço institucional publicado em /contato no site da Morar.
    address: "Rua Buriti, nº 139, Centro · Santa Rosa/RS · CEP 98780-753",
    logo: "/morar-site/logo.jpg",
    type: "jpg",
    width: 728,
    height: 291,
  },
} as const;

export type ContractLetterhead = (typeof LETTERHEADS)[ContractBrand] & { image: Uint8Array };

export async function loadContractLetterhead(brand: ContractBrand): Promise<ContractLetterhead> {
  const info = LETTERHEADS[brand];
  if (!info?.address.trim()) throw new Error("Falta o endereço institucional da imobiliária.");
  const response = await fetch(info.logo).catch(() => null);
  const image = response?.ok ? new Uint8Array(await response.arrayBuffer()) : new Uint8Array(0);
  const isLogo =
    info.type === "png"
      ? image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47
      : image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  if (!isLogo) throw new Error(`Falta a logo institucional de ${info.name}.`);
  return { ...info, image };
}

export async function sha256Hex(value: string | ArrayBuffer) {
  const buffer = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", buffer));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function contractVersionKey(
  text: string,
  letterhead: ContractLetterhead,
  revision: string,
) {
  const imageHash = await sha256Hex(new Uint8Array(letterhead.image).buffer);
  return `gen-${await sha256Hex(
    JSON.stringify([
      "word-letterhead-v2",
      revision,
      letterhead.name,
      letterhead.address,
      imageHash,
      text,
    ]),
  )}`;
}
