# Correções do commit 3aa8a196: corretor na conclusão, gatilho do Drive e corretor do rascunho

## O que muda
1. **"Concluir cadastro" feito por admin ou secretária.** Hoje, se a etapa de agenciamento vem sem corretor, `finalizePropertyAgencyCore` usa quem clicou (`context.userId`, linha 104). Com a correção:
   - Se quem conclui é admin ou secretária e não escolheu um corretor de forma explícita, o servidor escolhe o corretor pela mesma regra da publicação manual (`resolveAutoAgencyBroker`): primeiro `properties.corretor_id`, depois `created_by` se for corretor. Quem clicou nunca entra como candidato: o `publisherId` passado à regra não é aceito quando é admin ou secretária.
   - Sem candidato, o agenciamento não é criado. O passo fica como "pendente" com a mensagem "Imóvel sem corretor definido", e o imóvel continua na lista de pendências (não é marcado como concluído).
   - Corretor concluindo o próprio rascunho continua como hoje: ele mesmo.
   - A escolha do corretor vira uma função pura em `registration-rules.ts` (`resolveFinalizeAgencyBroker`), que dá para testar.
2. **Gatilho do Drive à prova de corrida.** `CREATE OR REPLACE` de `property_drive_rename_on_codes`: o INSERT passa a usar `ON CONFLICT (property_id) WHERE status IN ('pending','processing','retry') DO NOTHING`, que é o índice `property_drive_jobs_active_idx`. Mantenho o `NOT EXISTS` como filtro rápido. Para garantir que o gatilho nunca desfaça a gravação dos códigos, envolvo o INSERT em `BEGIN … EXCEPTION WHEN unique_violation THEN NULL END`. Nada mais muda na função.
3. **Corretor do rascunho preservado.** No salvamento final (`updateImovelCore`, chamado por `finalizePropertyRegistration`), `corretorId` e `corretorNome` vazios ou nulos deixam de ser enviados. O corretor gravado no rascunho continua. Se o usuário escolher outro corretor, essa escolha é gravada. A edição normal do imóvel não muda: lá, limpar o corretor continua sendo permitido.

## Opcionais (pequenos e de baixo risco)
- (a) **Repetir a conclusão não reenvia aos sites.** Se o imóvel já tem `registration_completed_at` e uma publicação ativa nos destinos pedidos, a conclusão pula a publicação (passo "ignorado") e não cria um job extra de atualização completa.
- (b) **Tela alinhada com o servidor.** A tela passa a considerar o cadastro concluído quando nem a publicação nem o agenciamento falharam, que é o mesmo critério do servidor. Se só a confirmação de códigos falhar, aparece apenas o aviso, sem "cadastro não concluído".

## Migração (só aditiva)
- Uma migração com o `CREATE OR REPLACE FUNCTION public.property_drive_rename_on_codes()`. O gatilho continua o mesmo.
- Nenhum UPDATE, INSERT ou DELETE em linhas existentes. Nenhuma coluna ou índice novo.

## Arquivos afetados
- `src/lib/imoveis/registration-rules.ts`: nova função pura `resolveFinalizeAgencyBroker`.
- `src/lib/imoveis/registration.functions.ts`: escolha do corretor antes do agenciamento, regra de "sem candidato", filtro dos campos de corretor vazios e os opcionais (a) e (b) do lado do servidor.
- `src/lib/agenciamentos/property-link.functions.ts`: o núcleo aceita um corretor já escolhido pelo servidor. Admin ou secretária sem corretor não caem mais em `context.userId`.
- `src/routes/_app.imoveis.novo.tsx`: critério de "concluído" da tela (b).
- Migração nova. Testes novos: `src/lib/imoveis/registration-rules.test.ts` e `tests/sql/` (ou junto com `tests/archive`, rodando em PGlite).
- `AGENTS.md`: ajuste da regra existente sobre a conclusão do cadastro (o corretor nunca é quem clicou se for admin ou secretária).

## Testes (TZ=America/Sao_Paulo + type check, todos os testes)
1. Admin ou secretária concluindo o rascunho de um corretor: o agenciamento fica com o `corretor_id` do imóvel ou, se vazio, com o criador corretor. Nunca com quem clicou. Sem candidato: não cria e o imóvel continua pendente. Corretor concluindo o próprio rascunho: fica ele mesmo.
2. Gatilho do Drive em PGlite isolado, com tabelas mínimas: com um job ativo já existente, o UPDATE dos códigos é gravado sem erro e continua existindo só um job ativo. Sem job ativo, cria um. Sem pasta, não cria nenhum.
3. Filtro dos campos de corretor (função pura): sem corretor escolhido, mantém o do rascunho. Com corretor escolhido, grava o escolhido.
4. Opcionais: repetir a conclusão já publicada não envia de novo. Falha só nos códigos é tratada como concluído na tela.

## Validação
Só testes automáticos e consultas de leitura. Sem imóvel de teste, sem enviar nada aos sites, sem publicar. Não crio agenciamentos para 1399/1385 nem mexo nos rascunhos órfãos.

## Riscos
- Admin ou secretária que hoje concluem rascunhos sem corretor definido passam a deixar o imóvel pendente. É o comportamento pedido, e o imóvel aparece na lista.
- Com o opcional (a), uma correção feita na própria tela de conclusão de um imóvel já publicado não segue sozinha para os sites. Ela continua possível pelo painel de publicação.
- O `EXCEPTION` no gatilho cria um ponto de retorno interno a cada execução. O custo é baixo, porque só roda quando os códigos mudam.

## Desvios
- Além do `ON CONFLICT`, o gatilho ganha `EXCEPTION WHEN unique_violation` como segunda proteção.
- O filtro de corretor vazio vale só na conclusão do cadastro, não na edição normal do imóvel.
