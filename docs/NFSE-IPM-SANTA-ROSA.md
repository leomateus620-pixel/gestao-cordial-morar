# NFS-e Santa Rosa/RS — integração IPM REST (NTE 122/2025)

## Por que IPM REST e não ABRASF

Santa Rosa/RS opera no Atende.Net com **layout próprio IPM 1.01**, exposto em
`WNERestServiceNFSe`. O padrão ABRASF 2.04 (SOAP, `WNENotaFiscalEletronicaNfe`, NTE 123/2025)
existe em outros municípios IPM, exige WSDL e assinatura digital A1/A3 e **não** é o
caminho de Santa Rosa. Nada de ABRASF neste projeto.

- Endpoint: `https://santarosa.atende.net/?pg=rest&service=WNERestServiceNFSe`
- Fallback: `https://ws-santarosa.atende.net:7443/?pg=rest&service=WNERestServiceNFSe`
- Código TOM: **8847** · IBGE: **4317202**
- Autenticação: **HTTP Basic** — cabeçalho `Authorization: Basic base64(login:senha)`,
  com login = CPF/CNPJ do emissor (só dígitos) e senha = **senha de acesso ao
  sistema** (a mesma do Portal do Cidadão), conforme IPM NT 35/2021 v2.9.
  Pré-requisito: no Portal do Cidadão, serviço **"Emissão de NFS-e por
  WebService → Liberar Acesso ao Usuário"** habilitado para o usuário.
  O corpo multipart leva apenas `cidade` (TOM 8847) e o arquivo XML (`f1`).
  Sem certificado digital e sem login/senha no corpo.

## Regra de negócio

A NFS-e da imobiliária é sobre o **serviço de administração/intermediação** —
`rental_contracts.comissao_mensal` — e nunca sobre o valor cheio do aluguel
(`valor_mensal`, que é repasse ao proprietário).

- Tomador: locatário principal do contrato (`rental_tenants`).
- Prestador: CNPJ da marca do contrato (`cordial` ou `morar`).
- Local da prestação: Santa Rosa (TOM 8847).

## Liberar o webservice no Portal do Cidadão

1. Acesse o Portal do Cidadão de Santa Rosa com o certificado/senha da empresa.
2. Menu do ISS/NFS-e → **Webservice / Integração** → gere a senha de webservice.
3. Confirme a inscrição municipal ativa e o item da lista de serviço habilitado
   (sugestão LC 116 **10.05** — administração de bens; confirme no cadastro municipal).
4. Anote também o **código NBS** exigido pelo layout da reforma.

### Formato do item da lista de serviço

O XSD da IPM exige `codigo_item_lista_servico` como **inteiro, sem ponto**. O
sistema normaliza na geração do XML, sem exigir mudança no valor salvo:

- `10.05` → `1005` (4 dígitos, padrão LC 116);
- `1.05` → `0105` (3 dígitos completados com zero à esquerda);
- `10.05.01` → `100501` (desdobramento de 6 dígitos, NT 122/2025 / CGNFS-e).

Se a prefeitura recusar o código de 4 dígitos, o fallback é salvar `10.05.01`
no cadastro (menu Integrações → NFS-e), que a normalização envia como `100501`.
Um valor com outro tamanho aborta a emissão antes do envio, com mensagem clara.
Os demais campos de código (NBS, situação tributária, CNPJ/CPF, CEP, TOM,
cIndOp, CST, cClassTrib) também saem só com dígitos.

## Segredos (servidor, nunca no client)

| Segredo | Uso |
| --- | --- |
| `IPM_NFSE_SENHA_CORDIAL` | senha do webservice da Cordial |
| `IPM_NFSE_SENHA_MORAR` | senha do webservice da Morar |
| `IPM_NFSE_LOGIN_CORDIAL` / `IPM_NFSE_LOGIN_MORAR` | opcional; por padrão o login é o CNPJ da configuração |

Cadastre em **Configurações do projeto → Secrets**. A interface só informa
"senha configurada / faltando" — o valor nunca é exibido nem enviado ao navegador.
Sem a senha, o sistema monta o XML, grava a prévia no histórico e bloqueia o envio
com mensagem clara.

## Teste x produção

`nfse_provider_settings.modo_teste` (padrão `true`) gera `<nfse_teste>1</nfse_teste>`:
a prefeitura roda todas as validações e responde "NFS-e válida para emissão", sem
emitir. Para produção, desligue o modo teste na configuração ou desmarque o toggle
no diálogo de emissão.

## Reforma tributária (IBS/CBS)

O XML inclui `<IBSCBS>` dentro de `<nf>` (`cLocalidadeIncid` = 4317202) e o grupo
`<IBSCBS>` de nível superior com `cIndOp`, `CST` e `cClassTrib` — todos editáveis por
marca. Optantes do Simples Nacional: marque `simples_nacional`, e os grupos IBS/CBS
são omitidos conforme a NTE.

## Arquivos

- `src/lib/nfse/ipm/xml.ts` — builder do XML, sanitização e parser do retorno
- `src/lib/nfse/ipm/xml.test.ts` — testes unitários
- `src/lib/nfse/ipm/client.server.ts` — POST multipart
- `src/lib/nfse/nfse.functions.ts` — configuração, histórico e `emitRentalNfse`
- `src/hooks/useRentalNfse.ts`, `src/components/alugueis/RentalNfseSection.tsx` — UI
- Tabelas: `nfse_provider_settings`, `rental_nfse_emissions`

## Fora de escopo (próximas fatias)

Cancelamento/substituição de nota e emissão em lote mensal.

## Onde configurar no sistema

Menu **Integrações** → card "NFS-e Santa Rosa (IPM)" (visível apenas para admin/financeiro):
CNPJ do prestador, inscrição municipal, razão social, item da lista de serviço (padrão 10.05),
código NBS, alíquota ISS, modo teste e Simples Nacional — por marca (Cordial e Morar).

A senha do webservice NUNCA fica no banco nem no navegador: cadastre em
Configurações do projeto → Secrets como `IPM_NFSE_SENHA_CORDIAL` / `IPM_NFSE_SENHA_MORAR`
(login opcional em `IPM_NFSE_LOGIN_*`; por padrão usa o CNPJ). O card mostra apenas
"senha configurada / faltando".

## Emissão

Ficha do aluguel → seção "NFS-e (Santa Rosa)" → **Emitir NFS-e**. O valor é sempre a
comissão mensal (serviço de administração), nunca o aluguel cheio. O modo teste vem
ligado por padrão e apenas valida na prefeitura.

## Etapa 1 — emissão segura (02/10/2026)

### Máquina de estados (`rental_nfse_emissions.status`)
`processando` → `teste_ok` | `emitida` | `erro` | `incerto`.
- A linha `processando` é gravada **antes** do envio (com `request_xml` e `identificador`).
- `emitida`: há `numero_nfse`, nenhum código de crítica e `situacao_codigo_nfse` 1 (ou ausente).
- `teste_ok`: modo teste com "válida para emissão".
- `erro`: recusa da prefeitura com código (definitiva).
- `incerto`: timeout, erro de rede, HTTP 5xx ou retorno ilegível. Bloqueia nova nota real até a conferência.
- `processando` há mais de 120 s vira `incerto` no próximo envio da marca.
- Emissão real **nunca** é reenviada automaticamente.

### Idempotência
`identificador` = `GC-<marca>-<contrato sem hífens>-<AAAAMM>-1` (teste: sufixo `-T`, ≤ 80).
A prefeitura não processa duas vezes o mesmo identificador e devolve a nota já gerada (NT 122).
Índices únicos: uma nota real (`processando`/`incerto`/`emitida`) por contrato+competência e um
`processando` por marca (o webservice é síncrono).

### Conferência
`reconcileRentalNfse` (admin/financeiro) reenvia o **mesmo** `request_xml` de uma linha `incerto`,
atualiza a mesma linha e incrementa `attempts`. Linhas antigas sem identificador não são conferidas.

### Trava de modo teste
Com `nfse_provider_settings.modo_teste = true`, o servidor força teste e recusa pedido real
("Modo teste ligado nas Integrações…"). Nota real exige `confirmarEmissaoReal: true`; o usuário fica em
`confirmacao_real_por`. Em linhas de teste, número, link e verificador não são gravados nem exibidos
(ficam só em `response_raw`).

### Validações (`src/lib/nfse/validation.ts`)
CPF/CNPJ com DV (CNPJ alfanumérico aceito), item 4/6 dígitos, NBS 9 dígitos, alíquota 0–5, situação
tributária só dígitos, endpoint `https://*.atende.net` (também CHECK no banco), e-mail e telefone
opcionais (inválidos são omitidos; DDI 55 removido). Aplicadas ao salvar e de novo antes do envio.
Endereço do tomador vem do imóvel (logradouro, número, complemento, bairro, CEP); cidade/CEP só vão
se o imóvel for em Santa Rosa. Competência `AAAA-MM`, lida do vencimento como texto; mais de 1 mês
no futuro é recusada.

### Encoding e parser
Retorno lido como bytes e decodificado pelo charset do Content-Type ou do prólogo (padrão
ISO-8859-1). Parser `fast-xml-parser` + zod (`src/lib/nfse/ipm/response.ts`); todas as mensagens
`NNNNN - texto` viram `error_codes`. JSON `{"retorno":{"msg","code"}}` continua suportado.

### Segurança
Só o servidor grava em `rental_nfse_emissions` (políticas de INSERT/UPDATE do navegador removidas).
Logs: uma linha JSON `evento: nfse_emissao` por tentativa, sem segredos.

### Etapa 2
Consulta e cancelamento de nota, emissão em lote mensal.
