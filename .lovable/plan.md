## Diagnóstico confirmado

- O usuário `felipe.cordialimoveis@gmail.com` existe com perfil `corretor`.
- Existem 9 agenciamentos no banco já vinculados ao Felipe por `created_by` e `corretor_id` usando o UUID correto.
- As políticas atuais de leitura permitem que ele veja registros criados por ele ou atribuídos a ele.
- Portanto, a correção deve focar no caminho real de leitura/filtro da aplicação e na robustez do vínculo corretor ↔ usuário para não voltar a falhar.

## Plano de implementação

1. **Corrigir a listagem server-side de Agenciamentos**
   - Ajustar `listAgenciamentos` para resolver o papel do usuário usando os papéis reais existentes (`admin`, `secretaria`, `corretor`).
   - Para corretor, retornar de forma explícita todos os registros em que ele é criador ou responsável.
   - Manter admin e secretária com visão ampla.

2. **Blindar o vínculo do corretor no salvamento**
   - No `createAgenciamento`, garantir que usuários corretores salvem sempre `created_by` e `corretor_id` com o ID autenticado do próprio usuário, ignorando qualquer valor incorreto vindo do formulário.
   - Para admin/secretária, manter a atribuição manual para qualquer corretor selecionado.

3. **Corrigir edição para não desvincular registros**
   - Impedir que um corretor altere `corretor_id`, `corretor_nome`, `created_by` ou campos de validação administrativa pela chamada de update.
   - Admin/secretária continuam com permissão operacional ampla.

4. **Fortalecer o filtro visual do menu**
   - Garantir que filtros ativos não escondam os registros recém-carregados do Felipe sem feedback claro.
   - Ao listar para corretor, manter o filtro de corretor travado no próprio usuário e evitar dependência de nome/iniciais.

5. **Validar com dados reais**
   - Confirmar no banco que os 9 registros do Felipe continuam vinculados corretamente.
   - Executar a tela com sessão autenticada do Felipe e verificar que a lista mostra os registros após recarregar.
   - Testar criação de novo agenciamento como Felipe e confirmar persistência depois de refetch/reload.

## Resultado esperado

Felipe passa a visualizar todos os agenciamentos criados por ele ou atribuídos a ele, inclusive após atualizar a página, e novos cadastros ficam vinculados ao usuário correto automaticamente.