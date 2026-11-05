# Morar: chumbo, vidro fosco e busca direta

Validação de 05/11/2026. Branch `codex/morar-chumbo-busca-direta`, baseada em `7a681e1b` de `main`.

## Experiência implementada

Tipo, localização, orçamento e espaços ficam montados no próprio formulário, na abertura e nos resultados, inclusive no celular. O select de tipo recebe o catálogo real. A localização oferece cidades e bairros do canal Morar; a escolha grava cidade e bairro juntos e o texto digitado sozinho não vira um filtro válido. A lista fica no portal do Radix, com navegação por setas, Enter e Escape.

Os valores usam apresentação em reais e chegam como números ao schema público existente. Um máximo menor que o mínimo recebe erro e foco no próprio input. Trocar Comprar/Alugar limpa os dois valores; mantém os demais critérios. Limpar filtros preserva a finalidade ativa. Os seletores de espaços mostram `2+` somente em contagem mínima e mantêm buscas exatas vindas da URL, inclusive zero e contagens fora dos atalhos usuais.

A gaveta edita apenas os campos avançados. O rascunho contém uma lista fechada de chaves e a aplicação faz uma mesclagem funcional no estado mais recente. Fechar descarta o rascunho. Os campos principais permanecem montados. A contagem usa `loadCatalogCount(..., "morar")`, debounce e cancelamento, preservando o último total confirmado durante uma atualização.

A busca da abertura também permanece montada enquanto a promessa existente da home entrega foto, imóvel semanal e vitrines. Isso evita perder um preenchimento iniciado durante o carregamento. Os consumidores compartilham a mesma promessa; seleção comercial e leitura de dados continuam no loader existente.

## Componentes e tokens

| Arquivo                     | Alteração                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `MorarSearchForm.tsx`       | Controles diretos, validação, contagem e rascunho avançado isolado                               |
| `MorarLocationCombobox.tsx` | Combobox ancorado em portal, identidade cidade/bairro e teclado                                  |
| `MorarIcon.tsx`             | Lucide, grade 24×24, traço 1,7, `currentColor`, sem preenchimento decorativo                     |
| `morar-search.ts`           | Regras puras de apresentação: reais, opções oficiais e lista de chaves avançadas                 |
| `HomePage.tsx`              | Busca Morar estável durante o carregamento, reaproveitando foto e card existentes                |
| `ResultsPage.tsx`           | Formulário Morar direto sempre disponível; filtros Cordial continuam no fluxo próprio            |
| `morar.css`                 | Tema consolidado, controles, portais, páginas públicas, faixa final e rodapé                     |
| `site.css`                  | `--cs-brand` → `--cs-accent`; `--cs-mint` → `--cs-highlight`; vidro Cordial com escopo explícito |
| `calendar.tsx`              | Anotação de props de `WeekNumber` para corrigir TS7031 preexistente; JSX idêntico                |

Os valores originais dos tokens Cordial foram mantidos. A prévia confirmou `#155466`, `#9bd6c9` e `#253b3e`, um formulário Cordial e nenhum formulário Morar na rota `/site` ([evidência](cordial-isolation.json)).

| Papel Morar              | Valor                               |
| ------------------------ | ----------------------------------- |
| Texto                    | `--cs-ink: #2a2f35`                 |
| Texto secundário         | `--cs-muted: #58616b`               |
| Acento neutro            | `--cs-accent: #343b43`              |
| Fundo escuro/rodapé      | `--cs-dark: #20262c`                |
| Destaque claro           | `--cs-highlight: #d7dde3`           |
| Fundo e superfície suave | `#f7f8fa`, `#e9edf1`                |
| Campos opacos            | `--ms-control: #f0f3f6`             |
| Limites essenciais       | `--ms-control-line: #7c8793`        |
| Ação                     | `--ms-action: #2a3036`              |
| Vidro                    | `rgba(42, 47, 53, .76)`, blur 18 px |
| Borda do vidro           | `rgba(255, 255, 255, .56)`          |
| Fallback sólido          | `--ms-glass-solid: #343a41`         |
| Erro / sucesso           | `#a62538` / `#1d6548`               |

`--ms-orange`, `--ms-button` e `--ms-warm` foram removidos. Os quatro acionadores, os painéis inline e a antiga gaveta de critérios principais também foram removidos. O CSS Morar foi reescrito por papéis e superfícies, com estados e breakpoints agrupados. A auditoria incluiu cores fixas, transparências, sombras, gradientes, SVGs, estilos inline e portais; a varredura de estilos ativos dos resultados não encontrou cores quentes ([JSON](active-color-audit.json)).

Cabeçalho, preços, favoritos, badges, bairros, seleção dos resultados, contatos, serviços, faixa final e rodapé seguem o novo tema. Os portais recebem `cordial-site morar-site` no próprio contêiner. Fotografias e logos usam os arquivos existentes; a conferência de `filter` retornou `none` para foto da abertura e logos. O blur ficou restrito à busca da abertura e ao card semanal.

## Capturas

As imagens “antes” foram obtidas no site informado; as “depois” usam os componentes atuais e a API pública real. A referência de arte é `C:/Users/Leonardo/Downloads/Busca imobiliária em vidro fumê.png`. Ela orienta material e hierarquia; não determina números de imóveis ou um tamanho fixo para todos os dispositivos.

O Windows usado na inspeção informa `prefers-reduced-transparency: reduce`. A prévia normal respeita esse estado. Para conferir também o material padrão, as capturas de vidro usam `?qa-glass=normal`, uma simulação restrita ao código de prévia, fora da aplicação publicada. A captura do fallback registra o comportamento normal com a preferência ativa.

| Superfície                        | Antes                                               | Depois                                        |
| --------------------------------- | --------------------------------------------------- | --------------------------------------------- |
| Abertura desktop, busca e semanal | [Antes](before-desktop-hero.jpg)                    | [Depois](after-desktop-hero.jpg)              |
| Controle em uso desktop           | [Painel intermediário](before-desktop-controls.jpg) | [Combobox direto](after-desktop-location.jpg) |
| Home completa desktop             | [Antes](before-desktop.jpg)                         | [Depois](after-desktop.jpg)                   |
| Resultados desktop                | [Antes](before-desktop-results.jpg)                 | [Depois](after-desktop-results.jpg)           |
| Faixa final e rodapé desktop      | [Antes](before-desktop-footer.jpg)                  | [Depois](after-desktop-footer.jpg)            |
| Home completa mobile              | [Antes](before-mobile.jpg)                          | [Depois](after-mobile.jpg)                    |
| Localização mobile                | [Gaveta anterior](before-mobile-controls.jpg)       | [Seleção direta](after-mobile-location.jpg)   |
| Faixa final e rodapé mobile       | [Antes](before-mobile-footer.jpg)                   | [Depois](after-mobile-footer.jpg)             |

Outros estados: [avançados desktop](after-desktop-advanced.jpg), [avançados mobile](after-mobile-advanced.jpg), [erro de preço](after-desktop-price-error.jpg), [busca mobile](after-mobile-search.jpg), [semanal mobile](after-mobile-weekly.jpg), [resultados mobile](after-mobile-results.jpg), [cards mobile](after-mobile-result-cards.jpg), [galeria em portal](after-mobile-gallery.jpg), [viewport curto](after-mobile-short-viewport.jpg), [contato](after-desktop-contact.jpg), [anúncio](after-desktop-anuncie.jpg), [financiamento](after-desktop-financiamento.jpg), [correspondente](after-desktop-correspondente.jpg) e [bairros](after-desktop-bairros.jpg).

## Validação

Comparações lado a lado: [abertura desktop](comparison-desktop.jpg), [mobile](comparison-mobile.jpg) e [faixa final/rodapé](comparison-footer.jpg). Também foram registrados o [menu móvel](after-mobile-menu.jpg), o [fallback de menor transparência](after-desktop-reduced-transparency.jpg) e o [reflow em 320 px](after-home-320x800-reflow.jpg). As páginas completas foram capturadas após percorrer os cards para carregar as fotos lazy; os recortes mantêm os arquivos completos como origem.

- Base antes da implementação: 155/155 testes relacionados aprovados.
- Suíte de site, Morar e arquivamento: 158/158 aprovados, incluindo três novos testes puros.
- Interações Morar: 14/14 aprovadas. A suíte dedicada cobre controles imediatos, localização oficial, teclado/Enter/Escape, preço, contagem exata, finalidade, limpeza, aplicação/descarte avançado, cancelamento da contagem, serialização/hidratação isolada e preenchimento durante a carga da home.
- Tipos globais e lint dos arquivos alterados aprovados. O calendário recebeu uma anotação de tipo para eliminar o erro TS7031 já presente no código base.
- Build completo aprovado com Node de heap ampliado. No Windows, o pacote `@lovable.dev/mcp-js@3.0.5` compara caminhos com separadores diferentes; a execução local precisou normalizar `parent` e `child` com `resolve()` dentro de `node_modules`. Esse ajuste de dependência não integra a PR. Avisos de chunks grandes e do parser WASM foram registrados pelo build, sem impedir a geração.
- A CI recebeu uma etapa própria `bun run test:morar`.

O CSS compartilhado `site.css` já divergia do Prettier na base e continua com a formatação existente; foram alterados somente os nomes dos tokens e o escopo do vidro Cordial. Os demais arquivos alterados passaram na conferência de formato. Na base `7a681e1b`, a CI já falhava na etapa Meta Ads e Lead Ads por FK em `marketing_action_grants_user_id_fkey`; isso é separado das verificações locais desta entrega.

No navegador: seleção de bairro com Enter sem submissão, CTA com deslocamento vertical de **0 px** ao abrir/selecionar a localização, gaveta só com avançados, aplicação preservando os principais, erro de intervalo, navegação para resultados reais e retorno da ficha com URL idêntica. O caso inspecionado produziu dois imóveis reais para Casa / Bairro Centro / Santa Rosa / R$ 100 mil–500 mil / 2+ dormitórios / com fotos; esse resultado é uma observação datada, não um valor fixado no código.

Foram conferidos 1280×720, 1366×768, 1440×900, 768×1024, 1024×768, 390×844 e 360×800. O navegador emulado arredonda algumas dimensões em até 1 px; alvos e dimensões observadas estão em [viewports.json](viewports.json). Nenhum overflow horizontal foi observado; os cinco destaques e os quinze adicionais permaneceram presentes. Em 360 px, vagas ocupa uma linha própria. Na gaveta estreita, os avançados ficam em uma coluna.

Contraste calculado no pior fundo branco atrás do vidro: labels **5,82:1**, texto dos campos **12,11:1**, texto secundário **5,65:1**, bordas dos campos **3,28:1**, contorno da ação sobre o vidro **3,19:1**, links do rodapé **11,70:1** e erro **6,46:1** ([cálculo](contrast.json)).

## Reprodução e limites

`bun install --frozen-lockfile`, `bun run test:site`, `bun run test:morar`, `bun run typecheck` e `bun run build` são as verificações do projeto. A prévia é iniciada por `bun run preview:morar` em `http://127.0.0.1:4174/site-morar`.

A prévia é uma composição cliente dos componentes e loaders reais, com proxy de leitura para a API pública. Não usa dados de demonstração e rejeita mutações. Ela foi necessária porque a credencial de servidor do catálogo não está configurada localmente. Não substitui uma validação de SSR completo com dados reais nem comprova publicação, migração ou ativação remota.

Mobile, viewport curto e reflow são evidência emulada. Teclado virtual de sistema, zoom real do navegador, leitores de tela e aparelhos físicos Safari/iPhone/Android continuam sem certificação nesta entrega. A avaliação visual e os cálculos não são uma auditoria formal completa de acessibilidade.
