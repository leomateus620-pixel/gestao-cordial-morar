# NFS-e nos Aluguéis — situação atual e o que falta

## Situação

A emissão está **construída e ligada**, mas **não configurada** — então hoje nenhuma nota sai.

O que já funciona:
- Botão "Emitir NFS-e" na ficha do aluguel, com modo teste, histórico de emissões e mensagens de erro.
- Cálculo sempre sobre a **comissão mensal** (serviço de administração), nunca sobre o aluguel cheio.
- Card de configuração em Integrações, por marca (Cordial e Morar), visível só para administração/financeiro.
- Endereço da prefeitura de Santa Rosa, código da cidade (8847), item 10.05 e alíquota 3% já preenchidos.

O que está faltando (verificado agora):

| Item | Cordial | Morar |
| --- | --- | --- |
| CNPJ do prestador | vazio | vazio |
| Inscrição municipal | vazia | vazia |
| Razão social | vazia | vazia |
| Código NBS | vazio | vazio |
| Senha do webservice da prefeitura | não cadastrada | não cadastrada |

Também: de 50 contratos ativos, **2 locatários estão sem CPF/CNPJ** — esses bloqueiam a emissão até o cadastro ser completado. Os outros 48 estão prontos.

## O que preciso de você

1. **Senha de webservice da prefeitura** (uma para cada empresa). Ela é gerada no Portal do Cidadão de Santa Rosa: entrar com o certificado/senha da empresa, ir no menu do ISS/NFS-e → Webservice/Integração e gerar a senha.
2. **CNPJ, inscrição municipal e razão social** de cada empresa (Cordial e Morar).
3. **Código NBS** e confirmação do item da lista de serviço (hoje está 10.05 — administração de bens) conforme o cadastro municipal.
4. Confirmar se alguma das empresas é **Simples Nacional** e se a alíquota de ISS é mesmo 3%.

## Como vou fechar

1. Você me passa CNPJ, inscrição, razão social e NBS — eu preencho e salvo para as duas marcas.
2. Abro o formulário seguro para você colar as duas senhas do webservice (elas ficam só no servidor, nunca aparecem na tela nem no navegador).
3. Rodo uma emissão em **modo teste** em um contrato de cada empresa. A prefeitura valida tudo e responde sem emitir nota de verdade.
4. Corrijo o que a prefeitura apontar (campos, item de serviço, dados do tomador).
5. Aviso quando estiver validado; só então você desliga o modo teste para emitir de verdade.
6. Completo, ou aviso quais são, os 2 locatários sem CPF/CNPJ.

## Detalhes técnicos

- Configuração em `nfse_provider_settings` (uma linha por marca); histórico em `rental_nfse_emissions`.
- Senhas nos segredos `IPM_NFSE_SENHA_CORDIAL` / `IPM_NFSE_SENHA_MORAR` (login opcional em `IPM_NFSE_LOGIN_*`; por padrão usa o CNPJ).
- Envio por `postNfse` (multipart para `WNERestServiceNFSe`, layout IPM 1.01, sem certificado digital).
- Sem senha, `emitRentalNfse` grava a prévia do XML no histórico e bloqueia o envio — comportamento atual esperado.
- Fora de escopo desta etapa: cancelamento/substituição de nota e emissão em lote mensal.
