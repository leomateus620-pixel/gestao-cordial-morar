# NFS-e Santa Rosa (IPM) — corrigir autenticação (Basic Auth)

## Diagnóstico confirmado no código

- `src/lib/nfse/ipm/client.server.ts` (`postNfse`) envia `login` e `senha` como campos do `multipart/form-data`, **sem cabeçalho `Authorization`**. Pela IPM NT 35/2021 v2.9 e NT 122/2025 v1.7, a autenticação é `Authorization: Basic base64(CNPJ:senha)`.
- `parseNfseResponse` (`src/lib/nfse/ipm/xml.ts`) só procura tags XML (`<codigo>`, `<mensagem>`...). O retorno real de 15/09 foi JSON `{"retorno":{"msg":"Acesso Negado!","sis":"EST","code":401}}` — o parser não extrai nada e o histórico grava apenas "HTTP 401", escondendo a mensagem real da prefeitura.
- As duas emissões de teste de 15/09 (Cordial e Morar) constam em `rental_nfse_emissions` com HTTP 401 "Acesso Negado!".

## O que vou fazer

1. **Autenticação Basic no cliente** (`src/lib/nfse/ipm/client.server.ts`)
   - Enviar `Authorization: Basic base64(login:senha)`, com login = CNPJ só dígitos (ou override `IPM_NFSE_LOGIN_*`) e senha = `IPM_NFSE_SENHA_*`.
   - Remover `login`/`senha` do corpo multipart; manter `f1` (XML) e `cidade` (TOM 8847), que não atrapalham.
   - Cookie PHPSESSID: **não** vou reaproveitar — o serviço REST é stateless com Basic por chamada; gerenciar sessão só adiciona fragilidade. Se a prefeitura exigir, avalio depois com base no retorno.

2. **Parse do retorno JSON** (`src/lib/nfse/ipm/xml.ts` → `parseNfseResponse`)
   - Se o corpo for JSON, ler `retorno.msg` / `retorno.code` (e variações) para `mensagem` e `codigosErro`, antes de tentar XML.
   - Resultado: `error_message` em `rental_nfse_emissions` passa a mostrar a mensagem real (ex.: "Acesso Negado! — Crítica 401 — HTTP 401") em vez de só "HTTP 401".

3. **Documentação** (`docs/NFSE-IPM-SANTA-ROSA.md`)
   - Corrigir: autenticação é HTTP Basic; a senha é a **senha de acesso ao sistema** (portal), com o serviço "Emissão de NFS-e por WebService → Liberar Acesso ao Usuário" habilitado no Portal do Cidadão — não uma senha separada de webservice.

4. **Testes unitários** (`src/lib/nfse/ipm/xml.test.ts` + novo teste do cliente)
   - Cabeçalho Basic montado corretamente (base64 de `login:senha`, login só dígitos).
   - Parse do JSON de erro (`retorno.msg`/`code`) e do JSON de sucesso.
   - Parse XML existente continua passando (sem regressão).

5. **Validação (só depois de aprovado e com as senhas já atualizadas por você)**
   - Repetir **somente em modo teste** um contrato por marca — Cordial (comissão R$ 100) e Morar (comissão R$ 85), os mesmos de 15/09 — pelo fluxo existente (`emitRentalNfse` com `modo_teste=true`).
   - Conferir o resultado em `rental_nfse_emissions` e te dizer se a prefeitura validou ou qual crítica retornou.
   - `modo_teste` permanece ligado; nenhuma emissão real.

## Arquivos afetados

- `src/lib/nfse/ipm/client.server.ts` — header Basic, corpo sem login/senha
- `src/lib/nfse/ipm/xml.ts` — parse de resposta JSON
- `src/lib/nfse/ipm/xml.test.ts` — testes do parse JSON
- novo `src/lib/nfse/ipm/client.test.ts` — teste do header Basic
- `docs/NFSE-IPM-SANTA-ROSA.md` — seção de autenticação

Sem migração de banco, sem mudança de segredos, sem mudança de UI.

## Riscos

- Se a prefeitura também exigir `login`/`senha` no corpo além do Basic, o primeiro teste pode falhar — o parse JSON novo vai mostrar a mensagem exata e ajusto na sequência.
- Se a senha cadastrada no cofre for a de webservice antiga e não a de acesso ao sistema, o 401 pode persistir; nesse caso a mensagem real da prefeitura vai aparecer no histórico e te oriento sobre qual senha usar.
- Nenhum risco para dados: modo teste não emite nota de verdade.

## Fora de escopo

- Emissão real, cancelamento/substituição, emissão em lote.
- Qualquer alteração em Imóveis, sync ImobiBrasil, push ou Atendimentos.
