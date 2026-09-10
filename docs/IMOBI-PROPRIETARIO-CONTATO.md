# Contato do proprietário: o que a API ImobiBrasil realmente expõe

Investigação de leitura (Etapa A) feita em 10/09/2026 com os tokens já configurados
(`IMOBIBRASIL_CORDIAL_TOKEN`, `IMOBIBRASIL_MORAR_TOKEN`). Nenhuma escrita foi feita.

## 1. `GET /imovel/dados/{codigoImovel}`

Chaves relacionadas a pessoas retornadas pelo detalhe do imóvel:

```
codigoImovel, codigoProprietario, codigoCorretor, codigoUsuarioAdicional, ...
```

Não há **nenhuma** chave de nome, telefone, celular, e-mail ou CPF do proprietário
no detalhe do imóvel — só o código numérico.

**E o código vem sempre zerado.** Amostra de 40 imóveis ativos com publicação
(23 Cordial + 17 Morar), incluindo imóveis importados do site e imóveis publicados
pelo Gestão:

| Provedor | Amostra | `codigoProprietario` != 0 |
| --- | --- | --- |
| Cordial | 23 | 0 |
| Morar | 17 | 0 |

`codigoCorretor` também volta `0` nas mesmas respostas, inclusive em imóveis onde o
Gestão enviou o código do corretor com sucesso (o dado aparece no painel do Imobi).
Ou seja: o layout expõe o campo, mas a API **mascara vínculos internos na leitura**
com o token de integração.

Endpoints alternativos testados — todos inexistentes:

```
/imovel/{id}/proprietario              404 "URL inválida."
/imovel/proprietario/{id}              404 "URL inválida."
/imovel/{id}/cliente/lista             404 "URL inválida."
/imovel/{id}/proprietario/lista        404 "URL inválida."
/proprietario/lista                    404 "URL inválida."
/imovel/proprietario/lista             404 "URL inválida."
/cliente/lista?codigoImovel={id}       200 — ignora o filtro, devolve a lista inteira
/imovel/dados/{id}?completo=1          200 — idêntico, codigoProprietario: 0
```

## 2. `GET /cliente/lista` e `GET /cliente/dados/{codigoCliente}`

A listagem traz apenas identificação:

```
codigoCliente, tipoPessoa, nome, razaoSocial, nomeFantasia, statusCliente
```

O detalhe do cliente **traz contato completo** (confirmado nos dois provedores):

```
codigoCliente, codigoCorretor, tipoPessoa, nome, razaoSocial, nomeFantasia,
email, telefone1, telefone2, telefone3, cpf, cnpj, logradouro, bairro,
numeroResidencia, cidade, estado, cep, ultimaAtualizacao, cadastradoEm,
referenciaCliente, statusCliente
```

Exemplo sanitizado (CPF/telefone truncados de propósito):

```json
{ "codigoCliente": 2381***, "tipoPessoa": "F", "nome": "M*** S***",
  "email": "m***@***", "telefone1": "5555***", "cpf": "012***" }
```

## 3. Conclusão

O contato existe no cadastro de clientes, mas **não há como saber qual cliente é o
proprietário de qual imóvel** com o token atual: o único elo (`codigoProprietario`)
volta zerado em 100% da amostra e não existe endpoint de vínculo imóvel↔cliente.

Consequência prática:

- Não dá para importar contato de proprietário junto com o imóvel.
- Não dá para fazer backfill dos ~806 imóveis importados — qualquer tentativa seria
  adivinhação por nome, o que geraria contato errado em ficha interna.

Para destravar é preciso que o suporte ImobiBrasil libere, no token da imobiliária,
o retorno de `codigoProprietario` em `/imovel/dados` (ou publique um endpoint de
vínculo). Com isso, o caminho já está mapeado: `/imovel/dados` → `codigoProprietario`
→ `/cliente/dados/{codigo}` → `nome`, `telefone1`, `email`.
