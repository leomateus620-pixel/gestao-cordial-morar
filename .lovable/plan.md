# Mensagem automática de repasse no cadastro de atendimento

Ao concluir o cadastro de um novo atendimento, a secretária recebe na tela um bloco com uma mensagem pronta, montada com os dados daquele atendimento e o nome do corretor responsável, com um botão para copiar.

## Quem e quando

- Aparece apenas para usuários com perfil **secretária** (hoje, Bianca).
- Aparece somente ao **criar** um atendimento (não na edição).
- Admin, corretor e financeiro não veem nada de diferente.

## Como funciona

1. A secretária preenche e salva o novo atendimento normalmente.
2. Assim que o atendimento é salvo, sobe um card discreto na tela com a mensagem pronta.
3. Botões: **Copiar mensagem**, **Enviar no WhatsApp** (abre a conversa com o cliente, quando há telefone válido) e **Fechar**.
4. A mensagem é montada dinamicamente: só entram os campos que o atendimento realmente tem preenchido — nada de linhas vazias ou "não informado".

## Formato da mensagem

Exemplo (venda, com todos os campos preenchidos):

```text
Novo atendimento — Maria Silva
Corretor responsável: Pablo Souza

Contato: (54) 99999-0000 (WhatsApp)
Origem: Instagram
Interesse: Compra • Apartamento • 2 dormitórios
Bairro: Centro
Orçamento: R$ 250.000 a R$ 320.000
Imóvel: AP-1042 — Residencial Bela Vista
Prioridade: Alta
Próximo passo: Agendar visita — 05/08 às 14h
Obs.: cliente prefere contato após as 18h

Cadastrado por Bianca em 03/08/2026 às 10:12
```

Linhas ausentes são omitidas. Quando não há corretor definido, sai "Corretor responsável: a definir".

## Detalhes técnicos

- Novo módulo `src/lib/atendimentos/handoff-message.ts`: função pura `buildHandoffMessage(atendimento, autorNome)` que retorna o texto, usando os labels já existentes em `src/types/atendimento.ts` (origem, finalidade, tipo, prioridade, próximo passo, dormitórios) e `formatCurrency`/formatação de data de `src/lib/format.ts`.
- Novo componente `src/components/atendimentos/AtendimentoHandoffDialog.tsx`: dialog enxuto com o texto em bloco monoespaçado, botão copiar (`navigator.clipboard` com fallback de seleção) e confirmação via toast `sonner`; link WhatsApp reaproveitando `whatsappHref` de `src/lib/attendances/whatsapp.ts`.
- Gate de acesso: nova função `canSeeAttendanceHandoffMessage(session)` em `src/lib/access-control.ts`, retornando `true` apenas para `perfil === "secretaria"`.
- Integração: em `src/routes/_app.atendimentos.tsx`, o handler passado como `onSubmit` do `AtendimentoFormModal` de criação guarda o atendimento criado em estado e abre o dialog quando o gate permite. Mesmo tratamento no atalho `src/components/sheets/novo-atendimento.tsx` (criação pelo dashboard), para o fluxo ser idêntico onde a Bianca criar.
- Nenhuma mudança de banco, RLS ou server function: tudo é apresentação sobre o registro já persistido.

## Testes

- Testes unitários em `handoff-message.test.ts` cobrindo: atendimento completo, atendimento mínimo (sem e-mail/orçamento/imóvel/observação), corretor a definir e trilha de aluguel.
- Validação no navegador: criar um atendimento como secretária e conferir que o card sobe com os dados corretos; conferir que outro perfil não vê o card.
