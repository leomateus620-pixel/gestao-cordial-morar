# Roadmap

- [x] Emissões como primeira visão; Detalhes preservados e NF reutilizada
- [x] Recibo de três vias: modelo, PDF, armazenamento protegido e cópia do link
- [x] Boleto sem provedor: abstração e estado indisponível
- [x] Validar tela, PDF, permissões e testes sem publicar (lint dos arquivos alterados limpo; lint global tem erros anteriores)

- [x] Sidebar "Editorial premium" (Sora + Manrope, itens sem descrição)
- [x] Cartão em volta de cada grupo de menu da sidebar
- [x] Navegação fluida: pílula ativa deslizante + transição de página
- [x] Ícones da sidebar mais vivos e atraentes, com cor por grupo
- [x] Busca e Integrações dentro de Configurações, somente para administrador
- [x] Fotos travadas: (a) checkpoint, (b) órfãs, (c) vaga x falha, (d) unknown múltiplo/clean_rebuild, (e) limite sem progresso, (f) Reenviar fotos admin
- [x] Fotos travadas (a)–(f) — entregue
- [x] Fotos: parar perda (enviar antes de apagar, limite 2/rodada, disjuntor 80%), destravar envios (delivery_unknown por evidência), ordem crescente + conferência real
- [x] Recuperação 1401C, 3398M, 3384M, 1277C, 1404C, 3380M, 1350C, 1349C (bloqueada: a rotina de fotos roda no app publicado; aguarda publish autorizado)
- [x] Relatório de fotos a mais: 1353, 3349, 1373, 3372, 1308, 781

## Seleções compartilhadas — correções Leonardo (14/10)
- [x] Excluir imóvel volta preservando a busca
- [x] Referência pública sem código interno
- [x] REVOKE anon/PUBLIC nas tabelas e funções auxiliares
- [x] Respeitar localização/valor ocultos no link público
- [x] Limite de tentativas + Cache-Control no-store no link público
- [x] Teste do retorno público sem dados internos
- [x] (opcional) sem id interno no link público

## Cordial Bot — plano de 16/10/2026
- [x] Etapa 1.3: modelos por configuração e limite de tokens adaptável (1200/4000)
- [ ] Etapa 1.1–1.2: histórico real e estado pendente; camada única de ferramentas com MCP
- [x] Adaptador Claude (anthropic/claude-sonnet-5) como modelo de análise
- [ ] Etapa 2: roteador e planejador; filtros de search_properties; busca semântica
- [ ] Etapa 3: pesquisa externa — pausada pelo Leonardo
- [ ] Etapa 4: resumo das 8h, assistant_facts
- [ ] Etapa 5: Estúdio de Conteúdo — vídeo montado no navegador (aceito)
