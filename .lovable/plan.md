# NFS-e no nome do proprietário, com endereço do imóvel

## O que muda para todos os aluguéis
- **Tomador:** passa a ser sempre o **proprietário** do imóvel, com o nome e o CPF/CNPJ que aparecem em "Imóvel e proprietário" do aluguel. O locatário deixa de ser usado.
- **Endereço fiscal:** passa a ser sempre o **endereço do imóvel**: rua, número, complemento, bairro e CEP do cadastro do imóvel. O município é Santa Rosa, preenchido com o código que já está cadastrado para a empresa.
- Se faltar o CEP no cadastro do imóvel, o campo aparece destacado com o aviso "Não consta no cadastro do imóvel — preencha".
- O perfil padrão de aluguel passa a ter o proprietário como tomador. O PDF da nota mostra o proprietário e o endereço do imóvel.
- Os demais itens continuam como estão: valor = comissão, competência = mês anterior e empresa = a do aluguel.

## Novo teste neste aluguel (modo teste, sem valor fiscal)
- Cordial, competência 09/2026, R$ 170,00
- Tomador: **Larissa Azevedo Petermann**, CPF 019.398.980-80
- Endereço: Avenida Santa Cruz, 81, Apto 301 Bloco 03, Centro, Santa Rosa/RS, CEP **98780-000**, o CEP geral que você autorizou, já que o cadastro do imóvel está sem CEP.
- O teste anterior, que saiu no nome do Rodrigo, continua no histórico de testes. Por ser só teste, ele não interfere em nada.
- Depois do teste, envio o PDF de como a nota ficou.

## Detalhes técnicos
- `src/lib/nfse/rental-prefill.ts`: `buildRentalPrefill` passa a receber os dados do proprietário e do endereço estruturado do imóvel (`property.proprietarioNome`, `proprietarioCpf`, `logradouro`, `numero`, `complemento`, `bairro`, `cep`) no lugar do locatário. O código do município vem de `p.prestador`/configuração (`cidade_tom` da empresa) quando o imóvel está em Santa Rosa. Os testes unitários são atualizados.
- `RentalNfseSection.tsx`: usa o proprietário e o imóvel; o aviso de campo faltando passa a citar o cadastro do imóvel.
- `fiscal-profile.ts`: `defaultRentalFiscalProfile` com `tomadorPapel: "proprietario"`.
- `pdf-archive.server.ts`: o PDF inclui o complemento do endereço.
- Sem mudança no banco e sem alterar cadastros. O teste é feito pela tela, em modo teste, e depois é conferido o registro gravado.
