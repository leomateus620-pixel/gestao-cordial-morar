import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage, LEGAL_CONTACT_EMAIL } from "@/components/legal/LegalPage";

const title = "Exclusão de dados — Gestão Cordial";
const description = "Como pedir a exclusão dos seus dados pessoais do Gestão Cordial.";

export const Route = createFileRoute("/exclusao-de-dados")({
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
  component: DeletionPage,
});

function DeletionPage() {
  return (
    <LegalPage title="Exclusão de dados">
      <p>
        Se você enviou seus dados à Cordial ou à Morar, por exemplo por um formulário de anúncio no
        Facebook ou Instagram, pode pedir que sejam apagados do Gestão Cordial, sistema mantido pela Cordial Imoveis LTDA (CNPJ 42.767.687/0001-35).
      </p>

      <h2>Como pedir</h2>
      <ul>
        <li>
          Envie um e-mail para <a href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=Exclus%C3%A3o%20de%20dados`}>{LEGAL_CONTACT_EMAIL}</a> com o assunto “Exclusão de dados”.
        </li>
        <li>
          Informe o nome e o telefone ou e-mail que você usou no formulário, para localizarmos o
          registro.
        </li>
      </ul>

      <h2>O que acontece depois</h2>
      <ul>
        <li>
          Conferimos que o pedido vem da própria pessoa, respondendo pelo mesmo e-mail ou telefone
          cadastrado. Não apagamos dados sem essa confirmação.
        </li>
        <li>A administração exclui os dados de contato e as respostas do formulário.</li>
        <li>Enviamos a confirmação da exclusão pelo mesmo canal.</li>
      </ul>

      <p>
        Mais detalhes sobre o tratamento dos dados estão na{" "}
        <Link to="/politica-de-privacidade">Política de Privacidade</Link>.
      </p>
    </LegalPage>
  );
}
