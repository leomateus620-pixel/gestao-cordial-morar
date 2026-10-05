# Remover a exigência de aprovação do perfil fiscal

## Situação atual
As duas empresas (Cordial e Morar) estão com o perfil fiscal **vazio** e sem aprovação. Hoje isso trava três coisas:
1. A revisão mostra "Perfil fiscal aprovado" como pendência que bloqueia o envio, inclusive em teste.
2. A descrição do serviço aparece como "Perfil fiscal pendente de aprovação".
3. A emissão real exige, além disso, um texto de "autorização de produção".

## O que muda
- **A aprovação do perfil deixa de ser exigida**, tanto para teste quanto para nota real. Não aparece mais na lista de pendências.
- **A autorização de produção também deixa de ser exigida.** A nota real passa a depender só de três coisas: desligar o modo teste da empresa, ter a senha da prefeitura cadastrada e marcar a confirmação da emissão real na hora do envio. Essa confirmação continua existindo.
- Quando a empresa não tiver perfil preenchido, o sistema usa um **perfil padrão de aluguel**:
  - Operação: administração de aluguel
  - Tomador: o locatário
  - Valor: a comissão mensal do aluguel
  - Competência: o mês anterior (como já foi feito)
  - Descrição: "Comissão de administração de aluguel — imóvel {endereço} — competência {mês/ano}"
  - Regime, município, item 10.05.01, NBS e IBS/CBS: os que já estão cadastrados para cada empresa
  - Retenções: zero
- Se alguém preencher um perfil em Integrações → NFS-e, ele passa a valer no lugar do padrão, sem precisar de aprovação.
- Em Integrações → NFS-e, os textos "aprovação do contador" e "autorização de produção" deixam de ser obrigatórios e passam a ser apenas uma observação opcional.

## O que continua bloqueando, porque sem isso a prefeitura recusa a nota
Senha da prefeitura cadastrada, CPF/CNPJ do tomador válido, endereço fiscal do tomador completo (CEP e código do município), e a proteção contra emitir duas vezes a mesma competência.

## Depois do ajuste
Faço o envio **em modo teste** no aluguel do Rodrigo: Cordial, setembro/2026, R$ 170,00. Só falta você me passar o CEP dele em Teresina, ou autorizar o uso do CEP geral da cidade (64000-001). Nenhuma nota real será emitida e o modo teste continua ligado.

## Detalhes técnicos
- `src/lib/nfse/fiscal-profile.ts`: `approvalReference` e `productionAuthorization` passam a ser opcionais/nulos; nova `defaultRentalFiscalProfile(settingsRow)` monta o perfil padrão a partir das configurações.
- `src/lib/nfse/nfse.functions.ts`:
  - em `prepare`, remover a pendência "profile" e usar `readFiscalProfile(...) ?? defaultRentalFiscalProfile(row)`;
  - em `mapSettings`, `configurationComplete` deixa de exigir `fiscal_approved_config_version`, e `productionEnabled` deixa de exigir `productionAuthorization` e `production_authorized_config_version`. As outras travas continuam: modo teste desligado e credenciais;
  - nos pontos com `ctx.profile!`, usar o perfil efetivo, e o histórico registra `approval: "perfil padrão"` quando não houver texto;
  - remover as travas de save que exigem `productionAuthorization` (linhas ~462 e ~1415).
- `NfseFiscalProfileEditor.tsx`: campos de aprovação e autorização opcionais.
- Atualizar os testes de NFS-e que esperavam esse bloqueio. Rodar test:nfse e typecheck.
- Sem migração. Os dados das empresas não mudam e o modo teste continua `true`.
- Atualizar a regra em `AGENTS.md` sobre a NFS-e (o perfil fiscal não exige aprovação; vale o perfil padrão de aluguel).
