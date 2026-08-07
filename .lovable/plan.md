# Card de agenciamento clicável por inteiro

Tornar todo o card do agenciamento uma superfície de abertura do cadastro, sem poluir o visual.

## O que muda

1. **Card inteiro clicável**
   - Clicar em qualquer área livre do card (tags, endereço, localização, proprietário, bloco Responsabilidade, checklist) abre o detalhe do agenciamento.
   - Botões de ação (Detalhes, Editar, Excluir, Reprovar, Validar, Drive, Site) continuam funcionando de forma independente — o clique neles não abre o detalhe.

2. **Feedback visual premium e discreto**
   - Cursor de ponteiro no card todo.
   - No hover: elevação levemente maior e borda com toque da cor primária (mantendo o mesmo desenho atual, sem novos elementos).
   - Uma seta discreta de "abrir" aparece só no hover/foco no canto do card, some fora dele — nenhum elemento novo permanente.
   - O título deixa de ser botão separado e passa a ser só texto em destaque, evitando sublinhado duplicado e ruído.

3. **Acessibilidade e mobile**
   - O card recebe papel de botão com rótulo ("Abrir agenciamento …"), abrindo também por Enter/Espaço, com anel de foco visível.
   - No toque, feedback de pressionar (leve redução de escala) para a área ficar claramente reativa.
   - Seleção de texto (ex.: telefone do proprietário) não dispara a abertura.

## Detalhes técnicos

- `src/components/agenciamentos/AgenciamentoCard.tsx`: `article` vira container interativo com `role="button"`, `tabIndex={0}`, `onClick`/`onKeyDown` chamando `onView`; a barra de ações recebe `onClick` com `stopPropagation`; guarda contra clique originado de seleção de texto e contra alvos dentro de `button`/`a`. Título convertido de `<button>` para `<h3>`. Indicador de abertura via ícone `ArrowUpRight` com `opacity-0 group-hover:opacity-100`.
- Sem mudanças em serviços, rotas, banco ou regras de negócio. Validação: typecheck e conferência visual em desktop e mobile.
