# Cadastro de imóvel que não termina: conclusão segura, rascunho visível e agenciamento automático

## Objetivo
Um imóvel cadastrado pelo Gestão nunca deve ficar "meio salvo" sem aviso: ou termina com códigos, agenciamento e envio aos sites, ou aparece claramente como "Cadastro não concluído", com um botão para terminar. Publicar pelo painel também cria o agenciamento que falta.

## O que muda
1. **Conclusão em uma única chamada no servidor** (`finalizePropertyRegistration`): salva os dados, confirma as reservas de código (ou reserva, se faltar), registra o agenciamento (mesma chave `property:<id>:initial-agency-listing`), tira a marca de rascunho e envia para publicação, se pedido. Cada passo é idempotente: duplo clique, nova tentativa ou aba fechada não duplicam imóvel, código, agenciamento nem envio. Devolve o resultado de cada passo, para a tela mostrar o que deu certo e o que falta.
2. **Rascunho visível**: o imóvel criado para receber fotos é gravado com `is_draft=true`. Catálogo e detalhe mostram o selo "Cadastro não concluído" e o botão "Concluir cadastro", que reabre o assistente no passo final. Em "Novo imóvel", se o usuário tiver um rascunho próprio, aparece a opção "Continuar cadastro". Ao Cancelar, voltar ou fechar a aba com rascunho pendente, aparece um aviso.
3. **Agenciamento automático ao publicar** (decisão do Leonardo): `enqueuePropertySync` com ação publish, para imóvel do Gestão sem agenciamento vinculado, cria o agenciamento antes de enviar.
   - Corretor: `properties.corretor_id`; se vazio, `created_by`; se vazio, quem publicou, só se for corretor. Admin ou secretária nunca viram responsáveis por terem clicado; sem corretor definido, o agenciamento não é criado e o caso aparece na lista de pendências.
   - Data: o dia (fuso de São Paulo) em que o imóvel foi criado.
   - Venda/Aluguel: vem da finalidade do imóvel; locação/temporada vira Aluguel.
   - Agenciamento existente nunca é sobrescrito. Se a criação falhar, a publicação continua e o problema fica registrado.
4. **Criador registrado**: `createImovel` grava `created_by` no servidor. Se quem cria é corretor e não há corretor definido, ele vira o corretor do imóvel, com o nome do perfil.
5. **Visão do admin**: o alerta que já roda (`property_create_stuck_alerts`) passa a avisar sobre imóveis do Gestão não arquivados, criados há mais de 30 min, sem publicação e/ou sem agenciamento. O corretor criador recebe "Seu cadastro não foi concluído" (uma vez por imóvel). Integrações ganha a lista "Cadastros não concluídos".
6. **Drive**: quando os códigos chegam depois, a pasta "IMÓVEL - SEM CÓDIGO" é renomeada para o nome com os códigos. Só renomeia; nada é apagado nem movido.

## Migração (aditiva, sem tocar em dados existentes)
- Nova coluna `properties.registration_completed_at` (vazia nos imóveis atuais).
- Nova versão de `property_create_stuck_alerts` com a regra dos 30 min e a deduplicação por imóvel (mesmo padrão do alerta atual).
- Função de leitura `list_incomplete_registrations` (admin/secretária veem todos; corretor vê só os próprios).
- Para que o alerta não dispare nos imóveis antigos, ele só olha imóveis criados depois da migração. Os casos antigos ficam só na lista para decisão manual.
- Nenhum UPDATE, INSERT ou DELETE em linhas existentes.

## Arquivos afetados
- Novo: `src/lib/imoveis/registration.functions.ts` (+ `registration.server.ts` com a regra do corretor/data/finalidade, que pode ser testada).
- `src/lib/imoveis/imoveis.functions.ts` (created_by, corretor padrão, is_draft no rascunho).
- `src/lib/imoveis/publish.functions.ts` (agenciamento automático no publish).
- `src/lib/agenciamentos/property-link.functions.ts` (lógica de inserção idempotente extraída para reuso).
- `src/routes/_app.imoveis.novo.tsx`, `src/routes/_app.imoveis.$imovelId.index.tsx`, `src/components/imoveis/PropertyCatalogCard.tsx`, `src/routes/_app.integracoes.tsx` (+ cartão novo de pendências).
- `src/hooks/useImoveis.ts`, `src/hooks/usePropertyAgency.ts`.
- Drive: `src/lib/imoveis/drive/property-drive.functions.ts` / `naming.ts`.
- Migração nova; `AGENTS.md` (regra: conclusão de cadastro só pela função única no servidor).

## Testes (TZ=America/Sao_Paulo + type check)
- Finalização: duplo clique, retry e repetição após fechar a aba geram um só agenciamento, uma só confirmação de código e um só envio.
- Publicação manual cria o agenciamento uma única vez; corretor certo quando publica corretor, admin ou secretária; admin sem corretor definido não vira responsável.
- created_by gravado; corretor criador vira corretor do imóvel.
- Rascunho criado com is_draft=true e listado como pendente; deixa de aparecer depois de concluído.
- Regra do alerta: dispara após 30 min; não dispara para concluído, arquivado ou com menos de 30 min (teste isolado em banco local, como no arquivamento).
- data_agenciamento: imóvel criado às 22:30 BRT de 01/10 recebe 2026-10-01.

## Validação
Sem criar imóvel de teste, sem publicar, sem enviar nada aos sites. Só testes automáticos e consultas de leitura (conferir que a lista de pendências mostra 1399/3398, 1385/3384 e os rascunhos órfãos).

## Dados para o Leonardo decidir um a um (nada é aplicado)
- Agenciamento faltando: 1399/3398 (Geandre) e 1385/3384 (Felipe), com o corretor e a data sugeridos.
- Rascunhos órfãos: 950689c8 (Geandre, 23/09, talvez refeito como 1388), 1bac0a1d (Ricardo, 27/08), os 5 rascunhos vazios, e o rascunho de 01/10 do Geandre. 0237848e já está arquivado (refeito como 1396) e fica de fora.
- Os imóveis antigos não serão marcados como rascunho automaticamente.

## Riscos
- O agenciamento automático pode criar um registro que alguém faria à mão; isso é evitado pela chave única e porque nada existente é sobrescrito.
- Marcar o rascunho com is_draft pode escondê-lo de filtros que hoje excluem rascunhos. Vou conferir os filtros e mostrar os rascunhos com o selo, em vez de escondê-los.
- O aviso ao fechar a aba depende do navegador; a lista de pendências e o alerta cobrem esse caso.

## Desvios da proposta
- Sem corretor definido e com admin/secretária publicando, o agenciamento não é criado (vai para pendências) em vez de ficar sem responsável.
- O alerta só vale para imóveis criados depois da migração, para não gerar notificações em massa sobre casos antigos.
- O estado partial/"Verificação remota divergente" e o atraso das fotos ficam fora deste plano, como pedido.
