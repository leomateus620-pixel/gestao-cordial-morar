# Imagem da semana com IA + área "Vitrine do site" (fases 2 e 3 juntas)

Uma única entrega, que segue a fase 1 já pronta na prévia. Não publico sem a sua autorização. O Realce, o site Morar, as fotos dos imóveis, o Drive e a marca-d'água não mudam.

## Como vai funcionar para você
1. **Escolha automática do imóvel da semana:** é um imóvel publicado no site Cordial, com capa horizontal e que não foi usado nas últimas 4 semanas. Você também pode escolher o imóvel e a foto manualmente no painel.
2. **Preparação antecipada:** no domingo às 18h (horário de São Paulo), o sistema prepara uma versão editada da foto. A edição é fiel: luz, contraste, branco, nitidez e enquadramento, sem inventar nem remover nada do imóvel.
3. **Sua aprovação:** no painel aparecem a original e a editada lado a lado, com prévia de computador e celular e o ponto de foco da imagem. Você pode aprovar, recusar, pedir nova edição ou usar a foto original.
4. **Troca na segunda às 06h:** a imagem aprovada entra na abertura da home. Sem aprovação, a home usa a foto original do imóvel escolhido e o painel avisa isso. Os dois horários podem ser ajustados no painel.
5. **Segurança da vitrine:** se o imóvel sair do site ou a foto deixar de existir, a vitrine passa para o próximo imóvel válido, com a foto original. Sem nenhum candidato, a abertura fica neutra, sem quebrar a página.
6. **Sem IA na visita:** nenhuma edição é feita enquanto alguém visita o site. A home só lê a imagem pronta.
7. **Custo e duplicidade:** antes de "Gerar nova edição", o painel mostra o custo estimado. Um segundo clique não cria pedido duplicado. Uma falha sem resposta clara fica como "incerta" e não é reenviada sozinha.

## Área "Vitrine do site" no painel do site
- **Cartão "Esta semana":** imóvel, foto, situação, vigência e próxima troca.
- **Comparador** entre a original e a editada, com a prévia da abertura no computador e no celular.
- **Ações:** Aprovar e ativar · Usar original · Gerar nova edição · Pausar automação · Trocar imóvel/foto.
- **Histórico das semanas,** com a última execução e os erros, explicados em linguagem simples.
- Só a administração pode aprovar, gerar ou pausar. A secretária pode só visualizar.

## Validação
- Build, checagem de tipos e testes do site.
- **Testes novos:** escolha do imóvel sem repetir, troca da semana sem duplicar, fallback ao retirar o imóvel e bloqueio de pedido duplicado.
- **Teste real:** uma edição com um imóvel publicado, conferida no painel e na home da prévia.
- Comprovo a rotina agendada com uma execução manual controlada. Só digo que a automação semanal está pronta depois de ver uma execução real registrada.

## Detalhes técnicos
- **Migração aditiva no journal Drizzle:** tabelas `cordial_site_showcase_weeks` (marca, semana ISO, imóvel, foto de origem e checksum, modelo, versão do prompt, estado `agendado|gerando|aguardando_revisao|pronto|ativo|falhou|incerto|recusado`, vigência, ponto focal, aprovado_por/em) e `cordial_site_showcase_attempts`, com chave única marca+semana+imóvel+foto. Também `cordial_site_showcase_settings` (horários, pausa) e uma trava de execução com expiração.
- **Acesso:** RLS, grants, política restritiva `meta_reviewer_block`. Escrita só pelo servidor. Leitura pública só da imagem ativa, por função que valida se o imóvel ainda está publicado.
- **Armazenamento:** bucket privado `cordial-showcase`. A entrega é feita pelo gateway de mídia atual do site, sem link público permanente.
- **Worker:** `/api/public/hooks/cordial-showcase`, autenticado com `internal_worker_headers()`, com um imóvel por execução e disjuntor em 402/403/429 repetido. Agendamento por cron em duas tarefas (preparar e ativar).
- **IA:** gateway de imagens com `openai/gpt-image-2.5-sunburst` em modo edição, conferido na lista de modelos antes do uso.
- **Código:** módulo puro `src/lib/cordial-site/showcase.ts` (escolha, estados, fallback, com testes), `showcase.server.ts` (geração e ativação), funções autenticadas para o painel, nova seção em `_app.site-administracao.tsx`, e o loader de `site.index.tsx` lê a imagem ativa.
