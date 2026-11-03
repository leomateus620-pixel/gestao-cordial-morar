# Site Cordial — vidro translúcido e foto de fundo sem branco

## 1. Caixa de busca em vidro translúcido
- Trocar o fundo branco por vidro translúcido (desfoque + leve brilho e borda clara), deixando a foto aparecer por trás.
- Garantir leitura: rótulos (Tipo de imóvel, Cidade, Bairro ou loteamento, Valor) e abas Quero comprar / Quero alugar em cor escura forte com leve sombra; campos com fundo claro semitransparente e texto escuro.
- "Buscar imóveis", "Pesquisa completa" e "Buscar por referência" continuam visíveis e legíveis.
- Se o navegador não suportar desfoque, cai para fundo claro quase opaco.

## 2. Cartão "Imóvel da semana" em vidro
- Mesmo vidro translúcido, com hierarquia organizada: selo, tipo, local, valor em destaque, linha de dormitórios / banheiros / m² com ícones alinhados.
- Botões lado a lado e do mesmo tamanho: "Conhecer este imóvel" (principal) e WhatsApp (ícone oficial, contorno verde, mais polido). No celular, empilhados.

## 3. Foto de fundo que fica branca
- Fundo da área da foto passa a ser escuro/petróleo (nunca branco), para nenhuma falha aparecer como branco.
- Quando a foto for recarregada ou trocada, a anterior fica na tela até a nova estar totalmente carregada, com transição suave, sem piscar.
- A animação de movimento lento vira um ciclo contínuo sem "salto" de reinício.
- Investigar se a foto é recarregada periodicamente (link temporário renovado) e manter o mesmo endereço enquanto válido.

## Verificação
- Conferir na prévia em computador, tablet e celular: contraste dos textos, botões visíveis, e observar a foto por alguns minutos sem aparecer branco.
- Site Morar e demais páginas não são alterados. Nada é publicado sem sua autorização.

## Detalhes técnicos
- Arquivos: `src/components/cordial-site/HomePage.tsx` (HeroImage, HeroCard, busca) e `site.css` (`.cs-hx-*`).
- HeroImage: camada dupla com troca só após `img.decode()`; `background` do `.cs-hx-hero-media` em token petróleo; keyframes `cs-hx-drift` com `alternate` contínuo, sem `opacity` 0.
- Vidro: `backdrop-filter: blur() saturate()` só a propriedade padrão; `@supports not` com fallback opaco.
