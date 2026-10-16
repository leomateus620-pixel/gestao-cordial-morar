# Identidade do Assistente Cordial

O símbolo reúne o C/casa geométrico da Cordial e o M/telhado da Morar em uma única marca. Azul-petróleo e cobre se conectam à identidade já usada no Gestão. A abertura entre as formas sugere conversa sem acrescentar uma estrela genérica de IA.

Referências pesquisadas em 16/10/2026: [Cordial Imóveis](https://cordialimoveis.com/) e [Morar Imóveis](https://www.imobiliariamorarimoveis.com.br/), conferidas com os arquivos de marca já presentes no repositório: `public/cordial-site/logo.png` e `public/morar-site/logo.jpg`.

## Arquivos

- `assistant-mark-master.png`: marca autoral criada pelo ImageGen nativo, 1254 × 1254, RGBA.
- `../../../public/assistant/assistant-mark.webp`: exportação lossless para o app; mesmos pixels e transparência do master.
- `cordial-restaurada.png`: reconstrução visual em 2159 × 728, branco com transparência.
- `morar-restaurada.png`: reconstrução visual em 2172 × 724, com transparência.
- `assistant-mark-prompt.md`: prompts e procedência da marca unificada.

As reconstruções em alta resolução são derivados para revisão, não matrizes oficiais vetoriais. Há pequenas diferenças de desenho/espaçamento produzidas pela geração. Os logos originais dos sites foram preservados. A identidade do assistente usa o novo símbolo e mantém os personagens dos agentes.

## Prompts das reconstruções

Geração nativa com cada original como referência, sem CLI, sem dados de negócio.

**Cordial:** restaurar o logo como marca branca plana e nítida, preservando símbolo C/casa, texto exato “Cordial” e “IMÓVEIS”, proporções e espaçamento. Remover serrilhado; fundo transparente real; sem textura, sombra, novos elementos ou redesign. Alta resolução, largura mínima desejada de 2048 px.

**Morar:** restaurar a referência original preservando telhado/M, coluna facetada, texto exato “MORAR” e “IMÓVEIS”, proporções e tipografia; cores laranja/cinza da referência. Remover fundo grafite, compressão e serrilhado; transparência real; sem novos efeitos ou elementos. Alta resolução, largura mínima desejada de 2048 px.

O visualizador isolado enfatiza pixels residuais de alfa muito baixo dos arquivos gerados. A aprovação visual considerou sua composição real no navegador, incluindo fundo escuro. A reconstrução não substitui a necessidade de matriz vetorial oficial para impressão.

## Aplicação e revisão

`AssistantMark.tsx` concentra o uso da marca no menu do Gestão, workspace, busca rápida, briefing, equipe mobile e botão do copiloto. SVG é apenas o contêiner acessível compatível com os ícones existentes; a arte renderizada é o arquivo gerado, sem redesenho manual.

Prévia isolada em `tests/assistant/identity.html`. Captura de revisão em `../screenshots/identidade-assistente.jpg`. Fontes e comparação visual em `../../../design-qa.md`.
