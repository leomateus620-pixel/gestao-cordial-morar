# Corrigir erro ao salvar alterações no "Editar atendimento"

## O que está acontecendo (confirmado no banco)

O banco tem uma regra de segurança que bloqueia qualquer troca de corretor ou de imobiliária feita por quem não é admin ou secretária (gatilho `enforce_attendance_assignment_scope`, erro "only management can assign an attendance").

O problema é que a tela de edição sempre reenvia o corretor e a imobiliária, mesmo quando o usuário não mexeu nesses campos. Além disso, quando o atendimento está sem corretor, o formulário envia o texto literal `a_definir` no lugar de "vazio" — a rotina de criação já converte esse valor, mas a de edição não. Nos dois casos o banco entende que houve tentativa de reatribuição e bloqueia o salvamento inteiro, mesmo que o corretor só tenha mudado um telefone ou uma observação.

Por isso o Felipe (corretor) não consegue salvar, e a Bianca/qualquer perfil também falha em atendimentos sem corretor definido.

## Correção

1. Tratar `a_definir` como "sem corretor" também na edição (igual já é feito no cadastro).
2. Antes de salvar, comparar corretor e imobiliária com o valor atual do registro e só enviar esses campos quando realmente mudaram — assim edições comuns deixam de acionar a regra de atribuição.
3. Traduzir os erros do banco para mensagens claras em português, por exemplo: "Somente administração pode alterar o corretor responsável" e "Corretor fora do escopo da imobiliária" — hoje aparece um erro técnico.

## Detalhes técnicos

- `src/lib/attendances/attendances.functions.ts` (`updateAttendance`): normalizar `corretorId === "a_definir"` para `null`; ler a linha atual (`corretor_id`, `imobiliaria`) e remover essas chaves do patch quando idênticas; mapear `error.code`/mensagem do Postgres (`42501`, `23514`) para mensagens amigáveis.
- Nenhuma migração de banco: as políticas RLS e os GRANTs de `attendances` já estão corretos (verificado — `authenticated` tem UPDATE em todas as colunas e a política permite criador, corretor vinculado, admin e secretária).
- Sem mudança de UI necessária; o modal continua igual.

## Testes e validação

- Teste unitário do normalizador de patch (corretor `a_definir`, campos inalterados removidos).
- Typecheck + suíte completa.
- Validação no preview: editar um atendimento como corretor (mudar telefone/observação) e salvar; editar um atendimento sem corretor definido e salvar; conferir que trocar de corretor como admin continua funcionando e que corretor recebe mensagem clara ao tentar.
