import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/legal/LegalPage";

const title = "Termos de Serviço — Gestão Cordial";
const description = "Condições de uso do Gestão Cordial, sistema da Cordial Imoveis LTDA.";
const url = "https://cordialgestao.com/termos-de-servico";

export const Route = createFileRoute("/termos-de-servico")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: url }],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Termos de Serviço">
      <p>
        Estes termos valem para o uso do Gestão Cordial, sistema mantido pela Cordial Imoveis LTDA
        (CNPJ 42.767.687/0001-35), nome fantasia Cordial Imoveis.
      </p>

      <h2>O que é o serviço</h2>
      <p>
        O Gestão Cordial é o sistema interno de gestão imobiliária da Cordial e da Morar. Ele
        organiza imóveis, atendimentos a clientes e anúncios da própria empresa.
      </p>

      <h2>Uso com Facebook e Instagram</h2>
      <ul>
        <li>
          Recebemos os contatos que as pessoas enviam pelos formulários dos nossos anúncios, para
          retornar o atendimento.
        </li>
        <li>Consultamos os resultados das campanhas da própria empresa.</li>
        <li>Não vendemos nem repassamos esses dados a terceiros.</li>
      </ul>

      <h2>Responsabilidades de quem usa</h2>
      <ul>
        <li>Informar dados verdadeiros nos formulários e cadastros.</li>
        <li>O acesso ao sistema é restrito à equipe autorizada da empresa.</li>
        <li>Não usar o serviço para fins ilegais ou para prejudicar outras pessoas.</li>
      </ul>

      <h2>Dados pessoais</h2>
      <p>
        O tratamento dos dados está descrito na{" "}
        <Link to="/politica-de-privacidade">Política de Privacidade</Link>. Para pedir a remoção,
        veja <Link to="/exclusao-de-dados">Exclusão de dados</Link>.
      </p>

      <h2>Alterações e legislação</h2>
      <p>
        Estes termos podem ser atualizados, e a versão vigente fica sempre nesta página. Eles
        seguem a legislação brasileira.
      </p>

      <h2>Contato</h2>
      <p>
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>
      </p>

      <p>Última atualização: 27 de outubro de 2026.</p>
    </LegalPage>
  );
}
