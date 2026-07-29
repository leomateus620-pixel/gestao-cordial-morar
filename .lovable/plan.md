## Ajuste no painel "Ações do atendimento"

Arquivo alvo: `src/components/atendimentos/AtendimentoDetailDrawer.tsx`.

### 1. Bloco "Encerrar atendimento"
- Remover os botões **Arquivar** e **Fechar** do painel de ações.
- Manter apenas **Perdido**, agora ocupando a largura total do bloco e com destaque vermelho (borda e texto em tom rose/vermelho, fundo claro e hover mais intenso), coerente com o destaque de "Perdidos" já usado no funil.
- O rótulo da seção passa a refletir a ação restante (ex.: "Marcar como perdido"), evitando a leitura de que ainda existem três encerramentos.

### 2. "Fechar" migra para "Progresso do atendimento"
- Na régua de etapas, ao clicar em **Fechamento** o sistema abre a confirmação já existente ("Fechar atendimento? — será movido para Fechamento e marcado como fechado").
- Confirmando, executa o mesmo fluxo atual de fechamento (`onCloseAttendance`), que move a etapa e grava o status; cancelando, nada muda.
- Só usuários com permissão de encerramento veem esse comportamento; para os demais, clicar em Fechamento continua apenas mudando a etapa, como hoje.

### 3. Arquivar
- A ação de arquivar sai da interface do atendimento. O handler `onArchive` e o diálogo permanecem no código apenas se ainda usados por outro ponto; caso contrário, o diálogo passa a tratar somente o caso "fechar".

Sem mudanças de banco, permissões ou regras de acesso — apenas UI e o gatilho de confirmação.
