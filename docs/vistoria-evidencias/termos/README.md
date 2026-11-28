# Termos de vistoria de entrada residencial

| Imobiliária | Download do arquivo registrado | Comparação visual |
| --- | --- | --- |
| Cordial Imóveis | [Termo fictício · 8 páginas](cordial.pdf) | [Antes, exemplar oficial e depois](comparacao-cordial.jpg) |
| Morar Imóveis | [Termo fictício · 7 páginas](morar.pdf) | [Antes, exemplar oficial e depois](comparacao-morar.jpg) |

Os arquivos saíram do botão **Concluir e registrar termo** com uma identidade de Secretaria e contratos fictícios. As figuras dos ambientes e medidores são sintéticas. As colunas centrais das comparações conservam a geometria, a marca e o rodapé dos originais. Dados das partes e fotografias particulares foram ocultados.

## Reprodução e referências

No commit `48298540`, o gerador de teste reproduziu o [laudo de referência anterior](../laudo-demonstracao.pdf). Também renderizamos o [laudo anterior da Morar](antes.pdf) e as colunas “Antes” com o código daquele commit e os mesmos registros fictícios das colunas “PDF baixado”.

As capturas de `vistoria-3-v1.pdf` mostram o cabeçalho de texto, resumo de contagens, medidores no início, duas fotos por linha e assinatura do responsável pela vistoria. Eram escolhas explícitas de `pdf.ts`. O modelo só recebia participantes da visita. A falta de uma agência Morar também podia cair no padrão Cordial. As telas de Aluguéis e Vistoria inteligente já compartilhavam a revisão.

- **Cordial.** Modelo oficial fornecido de 18 páginas. Conferimos abertura na página 1, descrição e grade na 3, continuação na 4, medidores na 17 e encerramento na 18. Logo vertical centralizada, título serifado em negrito de 13 pt, texto serifado de 11 pt, endereço e site em duas linhas. O arquivo de teste contém um locador, duas locatárias e espaços para duas testemunhas.
- **Morar.** Modelo oficial fornecido de 28 páginas. Conferimos abertura na página 1, ambientes nas páginas 2 e 10, continuações nas páginas 3 e 11, medidores nas páginas 26 e 27 e encerramento na 28. A versão inclui a logo horizontal, a cláusula de dez dias corridos e o endereço em uma linha. A quantidade de páginas acompanha o conteúdo registrado.
- **Saída e entrada comercial.** A revisão informa a pendência de aprovação para a combinação de marca, tipo e destinação. Os exemplares fornecidos cobrem a entrada residencial.

## Fluxo de emissão

Em **Aluguéis → Vistorias**, abrir a vistoria de entrada e acessar **Revisão**. A equipe pode registrar as condições gerais em **Dados** e escolher **Posição da foto no termo** nos detalhes de uma foto de medidor. A revisão identifica a imobiliária, as partes e os campos que precisam ser corrigidos. A mesma vistoria também pode ser aberta na central de Vistoria inteligente.

A prévia e a emissão oficial usam `toPdfModel` e o mesmo renderizador. A prévia recebe o carimbo “PRÉVIA”. O servidor recebe a revisão da vistoria e a identificação da revisão contratual conferida. Carrega o snapshot autorizado e as imagens originais, monta o PDF e calcula seu SHA-256. O arquivo entra no bucket privado `inspection-media` com versão e prefixo do hash. A RPC final compara o snapshot e registra o documento. O histórico baixa o arquivo arquivado por versão.

O cadastro de aluguel atual fornece um proprietário e a lista ordenada de locatários, com suporte ao vínculo antigo de locatário único. Para vistorias avulsas, a qualificação é preenchida nos participantes com papel de locador ou locatário, inclusive quando há mais de um de cada. Os endereços residenciais das partes ficam na qualificação. A identificação usa o endereço do imóvel vistoriado.

## Verificação

- Chrome em viewport de 390 × 844, com telas e downloads da aplicação, identidade fictícia de Secretaria, PostgreSQL isolado (PGlite), migrações e RPCs do projeto. O transporte de teste e o armazenamento de objetos são locais. O teste inicia a emissão pelos dois menus a partir da mesma revisão e compara os bytes. Também abre a versão arquivada pela central e compara seu download.
- Cômodos com 0, 1, 2, 3, 4 e 7 fotos, mais duas fotos de medidores. Foram verificadas 19 imagens de evidência em cada PDF, a preservação da proporção, as grades de retratos e o enquadramento da trinca na borda. A descrição longa continua com o nome do ambiente. O texto mantém a impossibilidade de teste, o fornecimento desligado e a leitura `00047,08 m³`.
- Falha de foto identificada por número e cômodo na revisão. A primeira tentativa encerra sem documento e o botão permite emitir após a recuperação da foto. A versão 2 tem caminho e hash próprios, e a versão 1 conserva seus bytes. Mudança de parte no contrato entre renderização e registro invalida o snapshot.
- Reabertura independente dos arquivos baixados com PDFium e verificação de texto e coordenadas com pdfplumber. Todas as páginas são A4. Texto e posições das imagens coincidiram entre a prévia e o oficial, com a única diferença do carimbo. A impressão foi conferida por renderização A4. A verificação móvel usou o navegador emulado.
- `bun run typecheck`, `bun run test`, `bun run build` e as suítes adicionais da CI para Morar, Marketing, Sites e bots públicos.

Para recriar os PDFs a partir das RPCs e do renderizador, executar `bunx tsx tests/vistoria/generate-pdf.ts`. Para reproduzir os downloads pela interface, iniciar `bunx vite --config tests/vistoria/vite.config.ts` e executar `bunx tsx tests/vistoria/browser-term.ts` com Chrome e Playwright disponíveis. O teste de regressão do banco integra `bun run test:rentals`.

## Aplicação no Gestão Cordial

Migração Drizzle `0123_inspection_term_snapshot`. Ensaio revertido, aplicação e verificação posterior via `Lovable.query_database`, projeto `feb646c9-c19a-4360-8cc9-bec5237532ea`. Registro `150` em `drizzle.__drizzle_migrations`, `created_at=1795836304028`, transação `10182775`. SHA-256 do SQL aplicado `475955373de8d9363d4efd6409362c54c8a68aa4b0be391eb0cdcc9e8f6bf152`.

A consulta posterior confirmou as cinco colunas, a checagem de acesso ao aluguel, a gravação do snapshot comparado, o bloqueio de leitura anônima e a execução do finalizador reservada ao servidor. A migração conserva os arquivos e registros históricos.
