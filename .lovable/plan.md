## Plano

1. **Corrigir a causa do salvamento automático**
   - Ajustar os controles da etapa 4 do `AgenciamentoFormModal` para impedir que cliques nos switches do checklist sejam interpretados como envio do formulário.
   - Garantir explicitamente que cada switch do checklist e o switch de validação administrativa tenha `type="button"`.

2. **Blindar o formulário contra fechamento involuntário**
   - Manter o envio apenas no botão final “Cadastrar agenciamento / Salvar alterações”.
   - Adicionar uma proteção no `handleSubmit` para aceitar submit somente quando ele vier do botão final, evitando submit acidental disparado por controles internos.

3. **Preservar progresso na etapa 4**
   - Confirmar que marcar/desmarcar checklist altera apenas o estado local do formulário e não chama `onSubmit` nem `onOpenChange(false)`.
   - Não alterar permissões da Bianca nem regras de admin; a validação administrativa continua bloqueada para não-admin.

4. **Verificação prática**
   - Testar o fluxo no preview: abrir Agenciamentos, avançar até “Checklist e revisão”, clicar em cada item do checklist e confirmar que o modal permanece aberto e não salva sozinho.
   - Testar o salvamento somente pelo botão final para garantir que o cadastro continua funcionando corretamente.