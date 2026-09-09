# Enviar corretor que agenciou e proprietário para o Imobi

## O que está acontecendo (verificado)

Os dois campos existem no cadastro do Gestão (`proprietário: nome, telefone, e-mail` e `quem agenciou`), mas **nunca são enviados** ao Imobi.

O envio ao Imobi já prevê três campos internos — `codigoProprietario`, `codigoCorretor` e `codigoUsuarioAdicional` — porém eles são preenchidos por uma rotina de "resolução de códigos" que hoje só sabe resolver **cidade, tipo de imóvel, característica e unidade de área**. Como o corretor e o proprietário nunca recebem código, os campos saem vazios do envio e por isso não aparecem na área dos corretores do Imobi.

Confirmado também: o cache local de listas do provedor tem apenas `city` (996), `property_type` (620) e `characteristic` (53) — nenhuma lista de corretores ou proprietários foi baixada até hoje.

Observação: o Imobi trabalha com **código de cadastro**, não com texto livre. Então não basta mandar o nome: é preciso casar cada corretor/proprietário do Gestão com o cadastro correspondente dentro do Imobi.

## Como vou resolver

**Etapa 1 — Descobrir o que a API do Imobi oferece (só leitura)**
Consultar a API dos dois sites atrás das listas de corretores e de proprietários e ver se existe cadastro de proprietário por API. Nada é gravado nesta etapa; o resultado define as duas etapas seguintes.

**Etapa 2 — Trazer as listas do Imobi para dentro do Gestão**
Guardar localmente a lista de corretores (e de proprietários, se a API expuser), do mesmo jeito que já é feito com cidades e tipos de imóvel, separadamente para Cordial e Morar.

**Etapa 3 — Casar automaticamente e permitir ajuste manual**
- Corretor: casar pelo nome de "quem agenciou" com o corretor equivalente no Imobi. Quando o nome for igual, o vínculo é automático.
- Proprietário: casar pelo nome do proprietário. Se a API permitir cadastrar, criar o proprietário no Imobi na primeira publicação e reaproveitar o código depois; se não permitir, o imóvel é enviado normalmente e o pendente fica listado para o administrador vincular.
- Uma tela simples em Integrações mostra o que não casou, para o administrador escolher o correspondente uma única vez.

**Etapa 4 — Enviar de verdade e reenviar o que já está publicado**
Passar a incluir `codigoCorretor` e `codigoProprietario` em toda publicação/atualização, reenviar os imóveis já publicados e conferir na área dos corretores do Imobi que os dados aparecem.

## Garantias

- Nome, telefone e e-mail do proprietário continuam **fora** de qualquer campo público (descrição, título, endereço). Só vão nos campos internos do Imobi.
- Se o código não for encontrado, o imóvel continua sendo publicado normalmente — apenas fica registrado como pendência, sem travar a sincronização.
- Nenhuma mudança em fotos, links, aluguéis ou financeiro.

## Detalhes técnicos

- `resolveProviderCodes` (`src/lib/imobibrasil/catalogs.server.ts`) ganha os domínios `broker` e `owner`, alimentados por `provider_catalog_items` (novos `kind`) e por `provider_value_maps` (override administrativo).
- `serializers.ts` já faz `assign(payload, "codigoProprietario"|"codigoCorretor", ...)`; nada muda no contrato, só passa a existir valor.
- Fonte local: `properties.corretor_id` / `corretor_nome` e `proprietario_nome` / `_telefone` / `_email`.
- Pendências de vínculo entram no fluxo já existente de `unmapped`, exibido em Integrações.
- Testes de serialização cobrindo: com código, sem código (campo omitido) e ausência de vazamento dos dados do proprietário nos campos públicos.
