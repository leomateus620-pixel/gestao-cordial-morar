# Corrigir edição e reclassificação de agenciamentos (corretores e Bianca)

## O que a investigação mostrou

O banco não é o problema: as regras de acesso da tabela de agenciamentos já permitem que o dono do registro, o corretor vinculado, a secretária e o admin atualizem o registro, e as permissões de API estão corretas. O bloqueio está no aplicativo, em três pontos:

1. **Identificação do corretor por nome/iniciais.** O sistema descobre "qual corretor sou eu" comparando o nome (ou as iniciais) da sessão com a lista de corretores. Se a lista ainda não carregou, se o nome estiver escrito diferente, ou se dois corretores tiverem as mesmas iniciais, o sistema conclui que o registro é de outra pessoa: o botão de editar (lápis) some e, se o usuário tentar salvar, a operação é recusada em silêncio com "Não foi possível editar este agenciamento". O identificador real do usuário logado já é gravado no registro e deveria ser usado direto.

2. **Registros validados ficam travados.** Um corretor não pode editar nada que já esteja validado, nem para trocar Venda/Aluguel.

3. **Perfil Secretária tratado de forma inconsistente.** No servidor a secretária conta como gestora do módulo; no aplicativo, não (falta a permissão `agenciamentos:manage` na definição do perfil). Consequência: ao abrir um agenciamento já validado, o formulário acusa "Somente administradores podem validar o agenciamento" e trava o salvamento, mesmo que ela só quisesse mudar a classificação. Ela também não consegue trocar o corretor responsável nem enxergar a lista completa nos filtros.

## Correções

- Usar o ID real do usuário logado como identificador do corretor na comparação de propriedade do registro, mantendo o casamento por nome apenas como reforço (nunca como única fonte).
- Permitir que corretor e secretária editem e reclassifiquem (Venda ↔ Aluguel) inclusive registros já validados. A validação em si continua restrita: quem não é admin não liga/desliga o selo de validado, e a regra do banco continua protegendo isso.
- Alinhar o perfil Secretária ao servidor, concedendo `agenciamentos:manage` no aplicativo, para que ela possa reatribuir corretor, filtrar por corretor e não seja mais barrada pelo aviso de validação.
- Não deixar mais a falha ser silenciosa: quando a edição for recusada, mostrar o motivo real em vez de uma mensagem genérica.
- Manter a confirmação já existente ao trocar Venda ↔ Aluguel e o recálculo automático da bonificação nas duas trilhas.

## Testes

- Testes automatizados da regra de edição: dono do registro, corretor vinculado, secretária, admin, registro validado, e caso em que a lista de corretores está vazia.
- Verificação no navegador: entrar como corretor e como Bianca, abrir um agenciamento, trocar a finalidade, salvar, recarregar e conferir a persistência, a troca de trilha e o painel de bonificação.

## Detalhes técnicos

- `src/services/agenciamentos.ts`: reescrever `canEditAgenciamento` para aceitar `user.id` como identificador do corretor (`item.corretorId === user.id || item.criadoPorId === user.id || item.corretorId === corretorId`) e remover o bloqueio por `status === "validado"` / `checklist.validado`.
- `src/hooks/useAgenciamentos.ts`: `effectiveBrokerId` passa a priorizar `session.id` (mantendo `currentBroker` apenas para exibir o nome); em `update`, retornar/propagar o motivo da recusa em vez de `false` mudo.
- `src/lib/mock/permissions.ts`: adicionar `agenciamentos:manage` ao perfil `secretaria`.
- `src/components/agenciamentos/AgenciamentoFormModal.tsx` / `validateAgenciamentoInput`: só acusar `permissaoValidacao` quando o usuário estiver *ligando* o selo de validado, não quando o registro já vem validado.
- Servidor (`agenciamentos.server.ts`) permanece como está: já trata admin+secretaria como gestores e continua ignorando alterações de `validado` de quem não pode.
- Sem migração de banco, sem alteração de RLS ou grants.
