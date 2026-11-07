# Auditoria somente leitura — conexões Cordial/Morar, sites próprios e resquícios Imobi

Regras da auditoria: nenhuma alteração de código, dados, configuração ou crons; nenhuma publicação; nenhuma chamada externa de sync; nenhuma mensagem a clientes. Só leitura de arquivos, consultas SELECT (agregadas quando envolverem dados pessoais) e GET anônimo nas páginas públicas.

## 1. Roteamento dos domínios
- Ler `src/server.ts`, `src/lib/cordial-site/domains.ts` e rotas `/site`, `/site-morar`.
- GET anônimo em cordialgestao.com, cordialimoveis.com, imobiliariamorarimoveis.com.br (com/sem www, caminhos antigos `/site*`), anotando status, redirecionamentos e marca exibida.
- Verificar se painel/login/admin e rotas internas respondem pelos domínios públicos.

## 2. Elegibilidade e códigos por site
- Ler funções `cordial_site_*`/`morar_site_*` de sync, views `*_site_eligible`, `owned_gallery_ready`, liberação administrativa.
- SELECT agregado: publicados por marca × autorização/disponibilidade/cadastro/liberação/arquivado/retirado/oculto; imóveis no destino errado; códigos duplicados ou ausentes.

## 3. Ciclo de vida e cache
- Criação, edição, retirada, arquivamento e exclusão: gatilhos, `finalizePropertyRegistration`, `owned-publication.server.ts`, cache/derivados públicos.
- Caso específico: Cordial 1384 (23 fotos no site vs 17 no Gestão) comparado a Morar 3383 (17/17): origem das 6 extras (derivados, galeria do canal, cache, `pending_remote_delete`).

## 4. Exposição pública (API/RLS)
- Políticas `anon` e funções públicas (`*_search`, `*_filtered`, `*_public_*`, seleções compartilhadas): checar se retornam proprietário, contatos internos, custos/comissões ou imóveis não elegíveis.
- Rodar o verificador de segurança existente só para leitura de achados.

## 5. Marca e contato cruzados
- WhatsApp, telefones, logos, metadados e imagens por marca; ocorrências de "Cordial" na Morar e vice-versa.

## 6. Resquícios Imobi/ImobiBrasil
- Mapear todo caminho HTTP Imobi (`src/lib/imobibrasil/*`, hooks `/api/public/hooks/*`) e confirmar no código que `integration-switch.ts` bloqueia antes de token e de cada tentativa.
- SELECT em `cron.job`, `cron.job_run_details` recentes, `property_sync_jobs`/attempts, `property_image_provider_publications`, mappings, `net._http_response` recentes e logs: o que ainda roda, o que grava, o que é só histórico.
- Classificar cada item: código morto, UI enganosa (textos "enviar", "fila", "Imobi"), cron ativo, escrita persistente.

## 7. Versão publicada
- Comparar código atual com HEAD 83b5dc7e informado; registrar se não for possível confirmar o deployment c89ea0a5.

## Entrega
Relatório em português: como funciona hoje; problemas reais com gravidade, impacto e evidência (arquivo:linha ou consulta); estado Imobi; o que está OK; o que não pôde ser verificado. Sem correções e sem PR.
