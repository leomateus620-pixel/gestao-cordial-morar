# Validação e limites de aceite

Execução em Windows, Node 24.15.0, Vite 7.3.2, PostgreSQL WASM/PGlite e Chromium do navegador integrado. Auditoria iniciada em 25/09/2026; validação concluída em 26/09/2026. Nenhum resultado abaixo representa deploy, equipamento físico ou produção.

## Base anterior à implementação

- Branch `main`, commit `8ea1de5fbc23778d7941500db1b906589fc9c04b`, remoto atualizado. Apenas `package-lock.json` não rastreado; preservado e excluído do PR.
- 332 testes existentes passaram; tipagem e build passaram.
- Lint integral já falhava: 116.630 ocorrências (116.607 erros e 23 avisos), majoritariamente formatação/CRLF e problemas anteriores. Não houve reformatação global para esconder esse baseline.

## Verificação do código novo

- Os mesmos 332 testes existentes passaram novamente.
- 22 testes do site passaram, executando a migração real nova sobre um esquema de teste das dependências: publicação explícita, separação de marcas, RLS, campos privados ausentes, nulos, unidades de área, referências literais, paginação determinística, fotos/capa/ordem, retirada, limites, contato idempotente e triagem.
- Tipagem, lint dos arquivos novos e dos arquivos alterados manualmente e build final passaram. Logs locais `.codex-site-*.log`. O arquivo gerado de rotas não foi reformatado manualmente. Busca nos assets públicos compilados não encontrou a chave de serviço, nomes de tabelas privadas do canal, caminhos de Storage ou credenciais de teste.
- No Windows desta execução, o executável Bun estava fora do PATH e `bun run test` não encontrou `bunx`. A lista exata do script existente foi executada com Node/tsx. A CI usa Bun, instalação congelada pelo lockfile e ambos os scripts de testes.
- Os 11 cenários HTTP passaram na execução final; resultados estão em [http-validation.json](evidence/http-validation.json). Comando reproduzível: `node scripts/cordial-site/verify-local.mjs`, após iniciar o adaptador de QA e a aplicação local. Uma rodada durante recarga/build concorrentes falhou ao ler o detalhe; a rodada final confirmou HTTP 200 e a galeria completa. A falha inicial de status 410 foi corrigida no adaptador SSR e coberta novamente.

O adaptador de QA contém 30 registros reais lidos do Gestão e 469 fotos canônicas, com aprovações **simuladas somente no banco local**. Não é catálogo de produção nem prova de autorização comercial. A política SQL é a mesma migração da aplicação; o adaptador REST/Storage de teste não substitui um ensaio no Supabase real. Não executa integrações externas de atendimento.

## Jornadas verificadas no navegador

- Home → busca de venda → filtros de Casa, Santa Rosa e preço máximo → grade/lista → favorito → detalhe da referência 975 → galeria de 11 fotos → próxima foto/teclado/Escape → cópia do link → voltar com filtros e modo lista preservados.
- Paginação para a segunda página mostrou 12 registros distintos; a cobertura de todas as páginas sem duplicação foi conferida por SQL e HTTP.
- Painel móvel apresenta os filtros completos, bairros dependentes da cidade e contagem de 10 correspondências para o recorte de teste. Limpar tudo restaurou 30 registros.
- Menu móvel abre por clique, fecha com Escape e devolve foco ao botão. Galeria também devolve foco ao acionador.
- Contato local: falha 503 mantém campos/mensagem e não exibe sucesso; após recuperar o serviço, a mesma tentativa confirma somente após persistência. Nenhum formulário no site antigo ou contato real foi enviado.
- A falha de backend revelou um problema de atualização periódica que interrompia formulários. A atualização foi limitada às páginas com catálogo; rascunhos transitórios ficam na memória do navegador por até 30 minutos, sem armazenamento persistente, e são apagados após envio confirmado. Recarregar completamente a aba encerra essa memória.

[Home](evidence/responsive-home.json), [resultados](evidence/responsive-results.json) e [detalhe](evidence/responsive-detail.json) foram medidos em 360, 390, 768, 1024 e 1440 pixels CSS: sem overflow horizontal. O viewport é emulado, não um aparelho físico. As capturas registram também menu, filtros, galeria, lista, contato com erro e contato confirmado. IDs públicos variam entre reinicializações do banco local.

## Segurança, disponibilidade e mídia

Asserções incluem SSR/JSON sem campos internos, bucket original privado, UUID/caminho/versão de mídia inválidos rejeitados, retirada removendo busca e mídia, detalhe conhecido retirado com HTTP 410 e URL desconhecida com 404. Backend indisponível responde 503, em vez de catálogo vazio ou falso sucesso. Corpo acima de 10 KB é rejeitado antes de persistir. Origem estrangeira de contato é rejeitada; repetição idempotente não cria outro lead.

O inventário e a verificação de existência de arquivos são integrais; a decodificação/inspeção visual é amostral. A revisão visual de todas as galerias elegíveis, a confirmação de marcas e a resolução de fotos de baixa resolução ainda precisam de aceite. O hero pode usar uma capa de baixa resolução já existente: o site não inventa detalhes nem faz upscale. Fotografias e descrições preservam a origem do Gestão.

## Pendências que impedem afirmar aceite integral

- Supabase de homologação com migrações reais, Storage, permissões e triggers completos; serviço secreto de servidor não estava disponível nesta sessão.
- Revisão comercial de todos os candidatos e ativação explícita do canal próprio. A migração nasce sem publicações; os 855 registros não foram indiscriminadamente publicados.
- Comparação de descrições, áreas, disponibilidade e identidade/capa/ordem visual das fotos com o antigo; 2 diferenças de preço e 29 de quantidade de fotos para revisar.
- Aprovação e cadastro de conteúdo institucional, notícias, contatos e privacidade. Vazios não foram preenchidos com conteúdo fictício. O módulo inicial lista até 100 páginas e 100 contatos recentes; paginação operacional além desse volume precisa de evolução antes de excedê-lo.
- Upload/versionamento dedicado de imagens institucionais pelo CMS: a entrega usa logo oficial versionado no repositório e fotografia autorizada do catálogo. Não afirma oferecer um gerenciador completo de biblioteca editorial.
- Firefox, WebKit, equipamentos físicos, teclado virtual, zoom amplo, leitor de tela e auditoria WCAG 2.2 AA completa. Foco/teclado e responsividade verificados não constituem certificação de acessibilidade.
- Métricas de campo LCP/INP/CLS no percentil 75, Lighthouse controlado e teste de carga do proxy Photon na hospedagem definitiva. Tempos de HTTP em dev, com processamento local e builds concorrentes, não são benchmark de produção.
- Ensaio de domínio raiz, redirects completos de venda/locação/bairros, restauração de backup e corte operacional. Nenhum DNS, domínio, autenticação global ou publicação existente foi alterado.

A PR é revisável e permanece em draft por essas dependências. CI remota deve ser consultada no próprio PR; teste local não comprova resultado remoto.
