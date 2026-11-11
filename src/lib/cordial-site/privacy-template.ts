import type { SiteBrand } from "./brand";
import type { SiteSettings } from "./contract";

export const PRIVACY_MIN_LENGTH = 500;

/** Pendências que impedem considerar a política publicável. */
export function privacyIssues(text: string): string[] {
  const issues: string[] = [];
  if (text.trim().length < PRIVACY_MIN_LENGTH)
    issues.push(`O texto precisa ter mais de ${PRIVACY_MIN_LENGTH} caracteres.`);
  if (/\[[^\]]*\]/.test(text)) issues.push("Ainda há marcadores entre colchetes para substituir.");
  return issues;
}

/** Rascunho com marcadores; nunca é salvo sem ação do administrador. */
export function privacyTemplate(brand: SiteBrand, s: Pick<SiteSettings, "brand" | "email" | "address">) {
  const name = s.brand || (brand === "morar" ? "Morar Imóveis" : "Cordial Imóveis");
  return `Política de Privacidade — ${name}

Esta política explica como [RAZÃO SOCIAL], inscrita no CNPJ [CNPJ], com endereço em ${s.address || "[ENDEREÇO]"}, trata os dados pessoais de quem usa este site, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).

1. Dados coletados
Coletamos os dados que você informa no formulário de contato (nome, telefone, e-mail e mensagem) e o imóvel de interesse. Com o seu consentimento, coletamos também métricas de navegação.

2. Finalidade
Os dados são usados para responder ao seu contato, apresentar imóveis e agendar atendimentos. Não vendemos dados pessoais.

3. Compartilhamento
Os dados são acessados apenas pela equipe ${name} e por fornecedores necessários ao funcionamento do site, sob obrigação de confidencialidade.

4. Cookies e métricas
Ferramentas de medição só são ativadas depois que você aceita. Você pode rever essa escolha a qualquer momento no rodapé do site.

5. Direitos do titular
Você pode pedir acesso, correção, exclusão ou portabilidade dos seus dados, ou revogar o consentimento, pelo e-mail do encarregado: ${s.email || "[E-MAIL DO ENCARREGADO]"}.

6. Guarda e segurança
Os dados são guardados pelo tempo necessário ao atendimento e às obrigações legais, com medidas de segurança adequadas.

7. Atualizações
Esta política pode ser atualizada; a versão vigente fica sempre publicada nesta página.`;
}
