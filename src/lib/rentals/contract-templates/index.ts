import cordialFiador from "./cordial-fiador.txt?raw";
import cordialCaucao from "./cordial-caucao.txt?raw";
import cordialSeguro from "./cordial-seguro_fianca.txt?raw";
import morarFiador from "./morar-fiador.txt?raw";
import morarCaucao from "./morar-caucao.txt?raw";
import morarSeguro from "./morar-seguro_fianca.txt?raw";
import type { ContractBrand, ContractGuarantee } from "../contract-generator";

export const CONTRACT_TEMPLATES: Record<`${ContractBrand}-${ContractGuarantee}`, string> = {
  "cordial-fiador": cordialFiador,
  "cordial-caucao": cordialCaucao,
  "cordial-seguro_fianca": cordialSeguro,
  "morar-fiador": morarFiador,
  "morar-caucao": morarCaucao,
  "morar-seguro_fianca": morarSeguro,
};
