# Push com a mesma cara da central de notificações

Hoje o push já dispara para toda notificação criada (o gatilho no banco enfileira cada uma), mas o conteúdo enviado é cru: título e mensagem puros, sem o rótulo do tipo, sem ícone por categoria e sem botão de ação. Objetivo: o push que chega no celular do Ricardo (e de todos que ativarem) ficar visualmente igual em linguagem à central — rótulo do tipo, ícone certo, texto claro e ação de abrir direto no lugar certo. A central continua recebendo tudo normalmente.

## O que muda na prática

Exemplo, notificação de atendimento:

```text
Antes:  Foi vinculado um atendimento a você
        Abrir?

Depois: 🤝 Atendimento atribuído · Cordial
        Ediane Ribeiro · (54) 8122-8160 — toque para abrir o atendimento
        [ Abrir atendimento ]  [ Marcar como lida ]
```

- Cada tipo (atendimento atribuído/iniciado, compromisso próximo, agenda de fotos, prazo financeiro, Google Agenda, sistema) ganha rótulo e ícone próprios, iguais aos da central.
- Quando existe imobiliária (Cordial/Morar), ela aparece no rótulo.
- O toque abre exatamente a tela da notificação (mesmo destino do botão da central).
- Botão de ação secundário "Marcar como lida" resolve direto pela notificação, sem abrir o app.
- Notificações do mesmo assunto se agrupam no celular em vez de empilhar avisos repetidos.

## Detalhes técnicos

1. **Catálogo compartilhado de apresentação** — extrair de `src/lib/notifications/notification-system.ts` um mapa neutro (rótulo, emoji/ícone, texto de CTA, chave de agrupamento) que possa ser lido tanto pelo cliente quanto pelo worker do servidor, sem trazer React para o worker.
2. **Worker de push** (`src/routes/api/public/hooks/push-worker.ts`): montar título/corpo com esse catálogo (`titulo` fica no corpo quando o rótulo assume o título), enviar `data` completo (`type`, `category`, `label`, `link`, `agency`, `entity_type/id`, `notification_id`) e usar `webpush.notification` com `icon`, `badge`, `tag` de agrupamento e `actions`.
3. **Service worker** (`public/firebase-messaging-sw.js`): renderizar a notificação a partir do `data` (ícone por categoria, `tag`, `renotify`, `actions`), tratar clique na ação "Marcar como lida" chamando o endpoint de leitura e o clique principal abrindo/focando a rota correta.
4. **Endpoint de leitura pelo push** — rota pública mínima que aceita o `notification_id` assinado pelo token do dispositivo, ou, mais simples e seguro, marcar como lida ao abrir o app pelo link (fallback) caso a chamada autenticada do service worker não esteja disponível. A decisão fica pelo caminho seguro: marcar ao abrir, e o botão de ação só aparece quando há sessão válida no service worker.
5. **Ícones**: usar `/favicon.ico` como base e adicionar badges monocromáticos por categoria em `public/` (arquivos pequenos, sem alterar o design do app).

## Validação

- Enviar duas notificações reais pelo pipeline normal para o usuário Ricardo (uma de atendimento, uma de agenda) e conferir na fila `push_outbox` o status `sent`.
- Confirmar no aparelho o formato: rótulo, ícone, corpo e ação.
- Verificar que a central continua exibindo as mesmas notificações sem duplicidade.

## Fora de escopo

Não altera limite de descrição, sync do Google Agenda, aviso de agenda de fotos, nem o desenho da central.
