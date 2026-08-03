# Mensagem de repasse: texto mais humano e card mais limpo

Ajustes na mensagem automática que aparece para a Bianca ao concluir o cadastro de um atendimento.

## Novo texto da mensagem

Abertura personalizada com o nome do corretor, frases corridas em vez de lista de campos, sem e-mail e sem assinatura final.

```text
Oi, Leonardo! Tem um novo atendimento vinculado a você.

A Bianca acabou de falar com a Maria Silva, que chegou pelo Instagram e
procura um apartamento de 2 dormitórios para compra, no bairro Centro,
com orçamento entre R$ 250.000 e R$ 320.000.

O imóvel de referência é o AP-1042 — Residencial Bela Vista.
O contato preferido dela é WhatsApp: (54) 99999-0000.
Prioridade alta. O próximo passo é agendar visita em 05/08 às 14h.

Observação: cliente prefere contato após as 18h.
```

Regras:
- Sem corretor definido: "Oi! Tem um novo atendimento vinculado a você (corretor a definir)."
- Só entram as informações realmente preenchidas — frases e trechos ausentes simplesmente não aparecem, sem sobrar vírgula ou linha vazia.
- Removidos: linha de e-mail do cliente, linha "Cadastrado por ... às ...".

## Ajustes de UI no card

- Rodapé com apenas dois botões: **Fechar** (secundário, à esquerda) e **Copiar mensagem** (principal, à direita). Botão do WhatsApp removido.
- Texto da mensagem em fonte de leitura normal (não monoespaçada), com espaçamento confortável e parágrafos separados, dentro de um bloco com fundo suave e borda leve.
- Título e subtítulo mais diretos: "Mensagem para o corretor" / "Copie e envie para o corretor responsável."
- Mantém o feedback de "Copiado" no botão e o toast de confirmação.

## Detalhes técnicos

- `src/lib/atendimentos/handoff-message.ts`: reescrever `buildHandoffMessage` para montar parágrafos em linguagem natural (helpers de frase por bloco: saudação, resumo do interesse, imóvel, contato, prioridade/próximo passo, observação). Assinatura passa a ignorar `autorNome` no texto final, mas o nome de quem cadastrou pode ser usado na frase "A Bianca acabou de falar com…" quando disponível.
- `src/components/atendimentos/AtendimentoHandoffDialog.tsx`: remover import/uso de `whatsappHref` e o botão WhatsApp; trocar o `<pre>` monoespaçado por um bloco de texto com `whitespace-pre-wrap` e tipografia do sistema; ajustar `DialogFooter`.
- `src/lib/atendimentos/handoff-message.test.ts`: atualizar os testes existentes para o novo formato e cobrir: mensagem completa, mensagem mínima (sem orçamento/imóvel/observação), corretor a definir, ausência de e-mail e de linha de cadastro.
- Sem mudanças de banco, RLS ou permissões — segue restrito ao perfil secretária.
