export function floatWhatsappLink(
  number: string,
  brandName: string,
  propertyUrl?: string | null,
) {
  const text = propertyUrl
    ? `Olá! Vim pelo site da ${brandName} e tenho interesse neste imóvel: ${propertyUrl}`
    : `Olá! Vim pelo site da ${brandName} e gostaria de atendimento.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
