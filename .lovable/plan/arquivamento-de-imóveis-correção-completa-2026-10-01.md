# Arquivamento de imóveis: correção completa

## Objetivo
Corretor, secretária e administrador conseguem arquivar e reativar imóveis. O anúncio sai de Cordial, Morar e do site próprio. O cadastro fica inteiro no Gestão, aparece em "Arquivados", e reativar não publica de novo.

## Defeitos confirmados no código e no banco
1. **Corretor bloqueado:** `property_retire_request` só aceita admin, ou secretária no caso de `unpublish`. Já o direito de editar imóveis, pela regra de acesso da tabela de imóveis, vale para admin, secretária e corretor. Por isso o corretor recebe `sem_permissao_para_ocultar_ou_excluir_imovel`.
2. **Arquivamento conclui cedo demais:** a função de pedido grava `enabled=false` em todos os vínculos. O `finalizePendingArchive` só considera pendente um vínculo com `enabled && status<>'unpublished'`. Na prática, a confirmação do primeiro site já marca o imóvel como "Arquivado".
3. **Erros de leitura ignorados:** o finalizador não confere o erro ao ler o imóvel e os vínculos. Uma falha na leitura vira lista vazia e o imóvel é arquivado. A gravação final também não confere revisão nem intenção.
4. **Reativação sem checagem:** `unarchiveImovel` limpa o estado com o cliente administrativo. Ele só confere se o usuário consegue ler o imóvel, sem checar o perfil e sem controle de concorrência.
5. **Fila lenta:** o arquivamento não acorda o worker. Ele só anda pelo cron.

## O que será feito

### Banco (uma migração aditiva, sem apagar nada)
- `property_retire_request`:
  - Para `unpublish`, aceita admin, secretária e corretor, usando o mesmo critério da regra de edição de imóveis.
  - Para `delete`, mantém exatamente a regra de hoje (exclusão continua separada).
  - Em cada destino guarda `archive_required=true` e a revisão da intenção na própria linha de publicação. Assim, o resultado de cada site fica ligado à intenção vigente.
  - Destino nunca publicado e sem criação ambígua fica de fora.
  - Destino com criação ambígua (`awaiting_create_reconcile`) entra e passa pela conferência de ausência que já existe.
  - Clique repetido em imóvel que já está em `pending_archive` devolve o mesmo pedido, sem novos jobs (idempotente).
- Nova `property_archive_finalize(_property_id, _expected_revision)`, SECURITY DEFINER, só para service_role:
  - Trava o imóvel e exige `removal_state='pending_archive'` e a revisão esperada.
  - Exige que todo destino marcado tenha `status='unpublished'` com a mesma intenção. Se faltar algum, retorna `pending` e lista os destinos que faltam.
  - Grava `archived_at` e `removal_state='archived'` numa única transação.
- Nova `property_unarchive(_property_id, _requested_by, _expected_revision)`:
  - Mesma regra de perfis do arquivamento, com trava e revisão.
  - Limpa só `archived_at` e `removal_state`.
  - Mantém `enabled=false` e `desired_availability='hidden'` em todos os vínculos.
  - Para o site próprio, mantém `cordial_site_publications` retirada (sem reaprovar). Republicar continua sendo uma ação explícita.
- Auditoria: as transições pedido, destino confirmado, arquivado e reativado são gravadas em `property_sync_attempts` e no histórico já usado pelo imóvel, com ator, data e falha. Vou conferir a tabela certa antes de gravar.
- Site próprio: no mesmo pedido de arquivamento, a publicação em `cordial_site_publications` é retirada na hora, via `cordial_site_sync_property`, que já recusa imóveis arquivados ou pendentes.
- Guards a auditar e completar só onde faltar: importação, reconciliação, `media_sync`, `update` e `publish` não podem reabrir `enabled` nem republicar um imóvel em `pending_archive`/`archived`.

### Servidor
- `archiveImovel`:
  - Revalida o perfil antes de qualquer mudança, para mostrar uma mensagem clara.
  - Chama o pedido e acorda o worker pelo mecanismo autenticado de `kickWorker` (o mesmo de `publish.functions.ts`), sem esperar o processamento.
  - Devolve um estado por destino.
- `finalizePendingArchive`: passa a chamar a nova RPC e repassa os erros, em vez de engolir.
- Worker `unpublish`: mantém `buildUnpublishPatch`, `/imovel/alterar/{id}`, a dupla leitura de visibilidade, o lease e a pausa global. Muda só a finalização, que passa a ser a RPC.
- Recuperação: o cron de reconciliação existente também tenta finalizar imóveis em `pending_archive` cujos destinos já estão confirmados. Isso cobre uma queda entre a ocultação no site e a finalização local.
- `unarchiveImovel`: passa a usar a RPC `property_unarchive`.
- Nunca chamar `purgeProperty`, `/imovel/excluir` nem liberar códigos.

### Tela
- Diálogo:
  - Lista o que fica preservado: cadastro, fotos, vídeos, documentos, Drive, códigos e histórico.
  - Mostra os canais de onde o anúncio vai sair, incluindo o site próprio.
  - Botão bloqueado durante o envio.
- Ficha:
  - Faixa "Arquivamento em andamento", com o estado de cada destino: pendente, retirado ou falhou.
  - Falha mostra a mensagem do site e um "Tentar de novo" só para aquele destino.
  - Acompanhamento automático pelo polling de 15 s que já existe.
  - "Arquivado" só aparece quando tudo estiver confirmado.
- Mensagens de sucesso: deixam de dizer "arquivado" enquanto houver destino pendente.
- Botão "Arquivar imóvel" visível no celular. Vou conferir a barra de ações da ficha.
- Atualização das listas: catálogo, arquivados, contadores e painel de sincronização se atualizam pelas invalidações que já existem, mais a do painel de sincronização.

## Testes
- **Funções puras e componentes:**
  - Decisão de permissão por perfil.
  - Montagem do estado por destino.
  - Finalizador: regressão com todos os vínculos `enabled=false`, Cordial confirmado e Morar pendente ou com falha, que não pode concluir; erro de leitura repassado; job antigo recusado.
- **Integração PostgreSQL** (banco isolado de testes, como `tests/cordial-site/database.ts`):
  - Corretor, secretária e admin arquivam e reativam. Usuário sem papel é recusado antes de qualquer mudança. Exclusão continua só admin.
  - Arquivamento sem publicação conclui na hora.
  - Imóvel só no site próprio sai de busca e detalhe.
  - Imóvel só em Cordial ou só em Morar, e imóvel nos dois (o primeiro não conclui sozinho).
  - Criação ambígua.
  - Clique duplo e duas abas.
  - Revisão antiga.
  - Reativação não republica e não reaprova no site próprio.
  - Republicação reusa os vínculos e IDs externos.
  - Comparação antes/depois de códigos, IDs externos, fotos e ordem, vídeos, documentos e Drive.
- Os novos testes entram em `test` / `test:site` e na CI.
- Comandos rodados: testes, `tsgo`, build e `test:site`.
- **Verificação visual:** desktop e celular no preview, com uma sessão de corretor, num imóvel de teste sem publicação externa.

## Fora do alcance desta entrega (precisa da sua decisão)
- **Retirada real nos sites Cordial/Morar:** só com um anúncio de teste que você indicar. Sem isso, a validação externa fica marcada como pendente, não como aprovada.
- **Vínculo Cordial divergente** (`hidden`, `enabled=false`, `status='published'`): vou investigar só lendo dados e trago a explicação. Não corrijo o cadastro sem a sua aprovação.
- **Publicação:** nada será publicado.
