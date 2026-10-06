# Sidebar — cards por seção + navegação mais fluida

Refinamento do visual "Editorial premium" já aplicado, sem mudar rotas, permissões nem conteúdo dos menus.

## O que será feito

### 1. Card ao redor de cada grupo de menu (seção)
Cada grupo (Operação, Relacionamento, Gestão, Sistema) ganha um cartão próprio dentro da sidebar:

- Fundo levemente elevado (tom petróleo mais claro), borda sutil e cantos arredondados — coerente com o restante da sidebar.
- Rótulo da seção vira cabeçalho do cartão, com um pequeno marcador de acento (fino, na cor verde-água) e um tom de acento levemente diferente por grupo, para dar identidade sem exagero.
- Espaçamento interno confortável entre cartões, com hierarquia clara entre os grupos.
- **Menu recolhido:** o cartão encolhe para uma versão compacta (apenas o bloco de ícones, sem rótulo), mantendo a separação visual entre grupos.
- **Menu do celular (drawer):** recebe o mesmo tratamento dos cartões.

### 2. Navegação mais fluida ao trocar de menu
- **Pílula ativa deslizante:** em vez de cada item acender separadamente, um único destaque verde-água desliza suavemente até o item da página atual dentro do seu cartão (medida por layout, animada com transform; respeita "reduzir movimento" do sistema).
- **Transição de página:** ao trocar de menu, o conteúdo principal entra com um fade + leve subida (só CSS, sem biblioteca nova), mantendo a página rápida e sem travar cliques repetidos.
- **Feedback de clique:** leve compressão no item pressionado já existente é mantida e refinada.

## Arquivos envolvidos
- `src/components/sidebar-menu.tsx` — estrutura dos cartões por seção e indicador deslizante.
- `src/components/app-shell.tsx` — wrapper de transição do conteúdo principal.
- `src/styles.css` — novos tokens (cartão, acentos por grupo, animações) e estilos.

## Fora do escopo
Nada de rotas, permissões, itens de menu, integrações ou dados. Apenas apresentação e microinterações.
