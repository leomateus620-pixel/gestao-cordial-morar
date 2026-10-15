# Seleções compartilhadas: admin e secretária no fluxo completo

## O que muda para quem usa
- **Admin e secretária**: no painel "Criar link", o campo "Responsável" vira uma lista com elas mesmas e os corretores ativos. Ao trocar o responsável, o WhatsApp sugerido passa a ser o dele (o último usado em seleções dele, se houver). O campo continua editável. Elas veem e gerenciam todas as seleções: editar, duplicar, encerrar e trocar o responsável.
- **Corretor** (sem papel de admin ou secretária): nada muda. O responsável é sempre ele, sem opção de troca, e ele vê e gerencia só as seleções que criou ou das quais é responsável.
- **Link público**: continua igual. Mostra o nome e o WhatsApp do responsável salvo.

## O que já existe (confirmado no código)
- A leitura e a gestão das seleções já liberam admin e secretária: `shared_selections_read` e `shared_selection_can_manage` (0010) usam `has_role` para admin e secretária, e para os outros casos `owner_id`/`corretor_id`. Por isso o corretor já vê só as seleções dele. O item 3 do pedido não precisa de mudança no banco, só no painel.
- O bloqueio está em dois lugares: `SelectionPanel.tsx:434-435`, onde o campo é somente leitura, e `shared_selection_save` (0010:95-96), que grava `corretor_id = auth.uid()` ao criar e nunca muda esse valor ao editar.
- O WhatsApp sugerido hoje fica guardado no navegador (`cordial:selecao:whatsapp`) e é o mesmo para qualquer responsável.
- Para listar os corretores, `list_assignable_brokers` já é usada em atendimentos e na equipe e pode ser reaproveitada.

## Migração aditiva prevista: `shared_selections_responsavel`
```sql
-- nova assinatura com p_corretor_id opcional (a antiga continua existindo e chama a nova)
CREATE OR REPLACE FUNCTION public.shared_selection_save(
  p_id uuid, p_request_id text, p_agency text, p_title text, p_message text,
  p_client text, p_whatsapp text, p_expires_at timestamptz, p_property_ids uuid[],
  p_corretor_id uuid)  -- NULL = manter o atual (edição) ou auth.uid() (criação)
...
  v_manager := has_role(v_uid,'admin') OR has_role(v_uid,'secretaria');
  v_target  := coalesce(p_corretor_id, <atual na edição>, v_uid);
  IF v_target <> v_uid AND NOT v_manager THEN RAISE EXCEPTION 'responsavel_nao_permitido'; END IF;
  IF NOT (has_role(v_target,'corretor') OR has_role(v_target,'admin') OR has_role(v_target,'secretaria'))
     THEN RAISE EXCEPTION 'responsavel_invalido'; END IF;
  -- criação: owner_id = v_uid, corretor_id = v_target
  -- edição: só gestor troca corretor_id; corretor editando mantém o atual
--  mesmas validações de antes (elegibilidade, limite, idempotência, troca atômica dos itens)
REVOKE ALL ON FUNCTION public.shared_selection_save(...10 args) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shared_selection_save(...10 args) TO authenticated;

-- a versão de 9 argumentos vira um repasse para a nova com p_corretor_id = NULL

REVOKE ALL ON public.shared_selection_rate_limits FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.shared_selection_rate_limits TO service_role;
```
- `owner_id` continua sendo sempre quem criou. Duplicar mantém o responsável, e o gestor pode trocá-lo antes de salvar.
- Nada é apagado. As regras públicas (`shared_selection_public`, elegibilidade, limite de tentativas e cabeçalhos) ficam como estão.

## Arquivos
- `src/lib/selecoes/rules.ts`: regras puras `canChooseResponsible(roles)` e `resolveResponsible(...)`, além do filtro de listagem por papel, que acompanha a regra do banco e serve para mostrar ou esconder botões.
- `src/lib/selecoes/selecoes.functions.ts`: `saveSelection` passa a aceitar `corretorId` opcional, e os erros novos ganham mensagens em português. `listSelections` passa a devolver `corretor_id`. Nova função `listSelectionResponsibles`, que só responde a admin e secretária e reaproveita `list_assignable_brokers` mais o próprio usuário.
- `src/components/selecoes/SelectionPanel.tsx`: o campo "Responsável" vira uma lista para gestores e continua somente leitura para o corretor. O WhatsApp sugerido segue o responsável escolhido.
- `src/routes/_app.selecoes.tsx`: mostra o responsável e as ações conforme o papel. A troca de responsável acontece pelo próprio painel de edição.
- A verificação de papel usa os papéis reais do banco (`has_role`). Assim, quem tem mais de um papel (por exemplo, secretaria e corretor) é tratado como gestora, não só pelo papel mais alto da sessão.

## Testes
- `rules.test.ts`: admin e secretária podem escolher; corretor puro não pode; usuário com secretaria e corretor pode; o filtro de listagem por papel funciona.
- Teste do banco (padrão `tests/*/database.ts`):
  - corretor que tenta outro `p_corretor_id` recebe `responsavel_nao_permitido`;
  - secretária atribui um corretor e `owner_id` continua sendo ela;
  - um responsável sem papel válido é recusado;
  - corretor não lê a seleção de outro;
  - `anon` e `authenticated` não acessam `shared_selection_rate_limits`.
- Os testes do link público continuam passando, além do typecheck e do build. No navegador: secretária cria um link atribuído a um corretor, e o corretor vê esse link na lista dele.

## Fora do escopo
Não publicar. Não mexer em NFS-e, sincronização Imobi ou fotos, endereço ou códigos. Não haverá campo de telefone no perfil do corretor: o WhatsApp sugerido vem das seleções anteriores dele.
