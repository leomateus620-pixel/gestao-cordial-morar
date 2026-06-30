# Redesign do modal "Novo aluguel"

Escopo restrito ao arquivo `src/components/alugueis/RentalFormModal.tsx`. Nenhum campo, rota, lógica, validação ou submit é alterado.

## Problemas atuais (visíveis nos prints)

- Labels minúsculas (10px) cinza-claro com baixo contraste — difíceis de ler.
- Inputs brancos sobre painel quase branco — sem definição visual, parecem "flutuando".
- Pílulas "Existente / Novo" com peso visual fraco; o estado ativo escapa rápido.
- Header pequeno e sem hierarquia, encolhido em uma sheet estreita (560px) mesmo em desktop.
- Modal sempre por baixo (`side="bottom"`) inclusive em desktop, parecendo bottom-sheet mobile travada.
- Espaçamento apertado, sem separação clara entre seções (Imóvel / Locatário / Fiador / Contrato).

## Mudanças propostas

### Layout responsivo
- Mobile (`< md`): mantém bottom sheet, mas com `max-w-full`, cantos arredondados topo, drag-handle visual, header sticky.
- Desktop (`>= md`): vira `side="right"` com largura `max-w-[640px]` e altura cheia — comportamento moderno de drawer lateral.
- Footer sticky com botões "Cancelar" e "Salvar aluguel" (já existe lógica de submit; só reapresentado).

### Tipografia
- Título: `text-2xl font-bold tracking-tight` + ícone de chave/casa antes do título.
- Descrição: `text-sm text-muted-foreground`.
- Labels: subir para `text-xs font-semibold uppercase tracking-wide text-foreground/80` (de 10px/55% opacity para 12px/80%).
- Inputs: `text-sm font-medium text-foreground` com placeholder `text-foreground/40`.
- Section titles ("IMÓVEL", "LOCATÁRIO", "FIADOR", "CONTRATO") em badge com ícone à esquerda, `text-[11px] font-bold uppercase tracking-[0.12em]`.

### Contraste e profundidade
- Painéis de seção: trocar `liquid-panel` quase invisível por card sólido `bg-card border border-border/60 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_8px_24px_-12px_rgba(15,23,42,0.18)]` para o efeito 3D suave do Cordial.
- Inputs: `bg-background border border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20` — borda visível em repouso, não só no focus.
- Toggle Existente/Novo: virar segmented control com fundo `bg-muted/60 p-1 rounded-full`, indicador ativo com `bg-primary text-primary-foreground shadow-sm`, inativo `text-foreground/70 hover:text-foreground`.
- Adicionar pequeno gradient accent na borda esquerda de cada section card (`border-l-2 border-l-primary/60`) para guiar o olho.

### Grid e espaçamento
- Mobile: campos em `grid-cols-1` (exceto pares naturais como UF/Cidade que ficam `grid-cols-2`).
- Desktop: `grid-cols-2` para a maioria; campos largos (Apelido, Logradouro, Endereço, Nome) ocupam `col-span-2`.
- Gap aumentado: `gap-4` entre campos, `space-y-6` entre seções.

### Section icons (lucide-react, já instalado)
- Imóvel: `Home`
- Locatário: `User`
- Fiador: `ShieldCheck`
- Contrato: `FileText` (nova seção visual agrupando valor/caução/datas/dia/status/obs — já existem os campos, só ganham um card próprio para fechar a hierarquia)

### Acessibilidade
- `htmlFor` real em todos os labels (`Field` recebe `id` opcional).
- `aria-invalid` quando `error` setado.
- Mensagem de erro com `text-destructive bg-destructive/10 border-destructive/30` em card destacado.

## Não muda
- Rota `/alugueis`.
- Campos, validações, tipos, props, hook `useRentals`, server functions, schema do banco.
- Lógica de submit, reset, modos existente/novo, montagem do `RentalContractInput`.

## Arquivos
- `src/components/alugueis/RentalFormModal.tsx` — reescrita visual (estrutura JSX/Tailwind apenas).

## Validação
- Build typecheck.
- Conferência visual no preview em mobile (375px) e desktop (1280px).
