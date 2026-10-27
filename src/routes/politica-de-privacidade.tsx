import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/legal/LegalPage";

const title = "Política de Privacidade — Gestão Cordial";
const description =
  "Como o Gestão Cordial trata os dados recebidos de formulários de anúncio e métricas de campanhas.";

export const Route = createFileRoute("/politica-de-privacidade")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade">
      <p>
        Esta política descreve como o Gestão Cordial, sistema interno de gestão imobiliária usado
        pelas imobiliárias Cordial e Morar, trata os dados pessoais que recebe, inclusive pelo
        aplicativo conectado à Meta (Facebook e Instagram).
      </p>

      <h2>Responsável e contato</h2>
      <p>
        A responsável pelo tratamento dos dados é a Cordial Imoveis LTDA (nome fantasia Cordial
        Imoveis), CNPJ 42.767.687/0001-35. O sistema também é usado pela imobiliária Morar. Para
        qualquer assunto sobre
        privacidade, escreva para <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
      </p>

      <h2>Dados que recebemos</h2>
      <ul>
        <li>
          <strong>Formulários de anúncio da Meta:</strong> quando você preenche um formulário em um
          anúncio da Cordial, recebemos as informações que você enviou, como nome, telefone, e-mail
          e as respostas às perguntas do formulário, além da data do envio e do anúncio de origem.
        </li>
        <li>
          <strong>Métricas de anúncios:</strong> números agregados das campanhas (alcance,
          cliques, custos e quantidade de contatos). Esses números não identificam pessoas.
        </li>
        <li>
          <strong>Contato direto:</strong> dados que você informa ao falar com nossa equipe.
        </li>
      </ul>

      <h2>Para que usamos</h2>
      <ul>
        <li>Registrar seu pedido como atendimento e retornar o contato sobre o imóvel de interesse.</li>
        <li>Acompanhar o andamento do atendimento pela equipe.</li>
        <li>Avaliar o desempenho das campanhas a partir das métricas agregadas.</li>
      </ul>
      <p>Não vendemos dados pessoais e não os usamos para outras finalidades além das descritas.</p>

      <h2>Quem tem acesso</h2>
      <p>
        Apenas pessoas da equipe com login no sistema, de acordo com o perfil de cada uma
        (administração, secretaria e corretores responsáveis pelo atendimento).
      </p>

      <h2>Compartilhamento</h2>
      <p>
        Os dados de formulários não são publicados nos sites de anúncios de imóveis nem repassados a
        terceiros para marketing. Eles ficam guardados nos serviços de hospedagem e banco de dados
        que sustentam o sistema, que atuam apenas como fornecedores de infraestrutura.
      </p>

      <h2>Armazenamento e guarda</h2>
      <p>
        Os dados ficam no banco de dados do sistema, com acesso protegido por login. Não há prazo
        fixo de exclusão automática; os dados são mantidos até que você peça a exclusão ou deixem
        de ser necessários ao atendimento.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Você pode pedir para saber quais dados temos sobre você, corrigi-los ou excluí-los, pelo
        e-mail <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>. Veja como pedir a
        exclusão em <Link to="/exclusao-de-dados">Exclusão de dados</Link>. Veja também os{" "}
        <Link to="/termos-de-servico">Termos de Serviço</Link>.
      </p>

      <h2>Alterações</h2>
      <p>Se esta política mudar, a data no topo desta página será atualizada.</p>
    </LegalPage>
  );
}
