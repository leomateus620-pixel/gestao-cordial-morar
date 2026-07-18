## Plano

1. **Substituir o modal atual por uma nova implementação**
   - Recriar `AgenciamentoFormModal` mantendo a mesma API pública usada pela rota de Agenciamentos: `open`, `agenciamento`, `corretores`, `currentBroker`, `currentUserBroker`, `canManage`, `onOpenChange` e `onSubmit`.
   - Preservar todos os campos atuais: imóvel, imobiliária, endereço, bairro, cidade, descrição, proprietário, telefone, contato preferencial, observações, corretor, data, origem, status, checklist, Drive, URL do site e observações internas.

2. **Remover a causa estrutural do bug do checklist**
   - Evitar que os controles do checklist fiquem dentro de um formulário HTML que possa disparar submit acidental.
   - Usar botões explícitos `type="button"` para navegação, checklist, fechar e voltar.
   - Deixar o salvamento em uma função dedicada chamada apenas pelo botão final “Cadastrar agenciamento” / “Salvar alterações”, sem depender de `onSubmit` do `<form>`.

3. **Criar navegação por etapas mais robusta**
   - Manter as 4 etapas atuais: Imóvel, Proprietário, Responsabilidade e Checklist/Revisão.
   - Validar somente os campos da etapa antes de avançar.
   - Permitir voltar sem perder dados.
   - Permitir navegar para etapas já liberadas, sem resetar o estado.
   - Manter inicialização estável: o formulário só reinicia quando abrir o modal ou trocar o agenciamento editado.

4. **Redesenhar responsividade do modal**
   - Desktop: modal central amplo, com trilha lateral de etapas e conteúdo com rolagem interna controlada.
   - Mobile: modal em tela cheia, barra de progresso superior, footer fixo com ações e campos confortáveis para toque.
   - Evitar sobreposição entre conteúdo, checklist, scroll e botões finais.

5. **Reconstruir o checklist de forma segura**
   - Substituir o comportamento atual do checklist por controles isolados, clicáveis e sem submissão implícita.
   - Cada item altera apenas o estado local do checklist.
   - O modal não fecha, não salva e não mostra “Salvando...” ao clicar em Fotos, Drive, Placa, Site, Vídeo ou Validação.
   - Manter “Agenciamento validado” bloqueado para quem não é admin/gestão.

6. **Preservar regras e persistência existentes**
   - Continuar usando `validateAgenciamentoInput`, `formatPhoneBR`, labels e tipos já existentes.
   - Continuar enviando o mesmo `AgenciamentoInput` para criação/edição, sem alterar backend, permissões, RLS ou regras da Bianca/admin.
   - Manter edição e cadastro usando o fluxo atual da página `_app.agenciamentos.tsx`.

7. **Verificação prática**
   - Testar no preview abrir/criar/editar Agenciamento, avançar até Checklist e clicar em todos os itens.
   - Confirmar que o modal permanece aberto e que não há salvamento automático.
   - Confirmar que o salvamento acontece apenas pelo botão final.
   - Conferir desktop e mobile para garantir que o novo modal esteja navegável e responsivo.