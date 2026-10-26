# Ativação do webhook Meta Lead Ads (Gestão Cordial)

## Estado confirmado agora (leitura)
- Código: rota `/api/public/meta/leadgen` (GET challenge, POST com assinatura sobre bytes originais, persistência antes do 200), worker `/api/public/hooks/meta-leads` e testes já existem.
- Banco: a 0039 está no journal (when 1793000000000, posterior à última aplicada), mas **não aplicada**: sem tabelas `meta_lead_*`, sem RPCs `meta_lead_*`, sem cron do worker. 39 migrações aplicadas.
- Secrets: as 7 chaves Meta e `WORKER_HOOK_SECRET` existem no ambiente (só presença conferida; nenhum valor visto).
- O 503 "Webhook not configured" é esperado hoje: o site publicado é anterior às chaves e a função que lê conexões depende da 0039.

## Etapas
1. **Compatibilidade antes de migrar**: comparar o que a 0039 revoga (acesso direto do app às tabelas de Marketing e conexões) com o que o código publicado usa. Se o publicado ainda lê essas tabelas direto, publicar primeiro o código atual (que usa `ad_connections_public()` e funções server-side) e só depois aplicar a 0039, numa janela curta; senão aplicar direto.
2. **Aplicar a 0039** pelo fluxo Drizzle suportado. Ela contém troca de restrição em `ad_sync_jobs` (pede sua aprovação no cartão). Conferir depois: tabelas, RLS, grants, RPCs, `search_path`, e que Marketing continua abrindo.
3. **Publicar** para que cordialgestao.com receba as chaves e o código. Teste interno: GET com o token certo devolve 200 e exatamente o `hub.challenge`; token errado 403. O token é lido do ambiente dentro do script, nunca impresso.
4. **Meta (leitura pela conexão Meta Ads)**: `/me/permissions`, Página `META_PAGE_ID` x conta `act_1010379113136989`, tipo de token (Página com `leads_retrieval`, `pages_manage_ads`, `pages_read_engagement`), `subscribed_apps` atuais da Página. Se faltar permissão, digo exatamente qual.
5. **Inscrição da Página**: POST `/{page}/subscribed_apps` com `subscribed_fields=leadgen` somando às assinaturas existentes (cartão de aprovação). A assinatura do aplicativo (objeto Page, campo leadgen, "Verificar e salvar") não tenho como operar no painel Meta Developers; entrego o passo a passo exato e não declaro como feito.
6. **Worker**: só depois de 2–5 comprovados, ativar o cron (via `internal_worker_headers()`) e testar 401 sem credencial e 200 autenticado. Deduplicação por `leadgen_id` impede atendimento/notificação repetidos.
7. **Integrações → Meta Ads** (admin): URL do callback com "Copiar URL", situação do backend, verificação do webhook, assinatura leadgen do app, inscrição da Página, último lead processado e falhas recuperáveis. Sem tokens; dados por função server-side.
8. **Testes**: Ferramenta oficial de teste de Lead Ads da Meta até o atendimento no CRM (sem anúncio, verba ou mensagem ao interessado); assinatura inválida (403), evento repetido (um atendimento só), falha de persistência (503, nada de 200). Rodar testes existentes, typecheck.
9. **Documentação**: atualizar `docs/meta-ads/operacao.md` e `validacao.md` separando: código implantado, migração aplicada, secrets, callback validado, worker ativo, app assinado, Página inscrita, teste oficial.

## Passo a passo manual (Meta Developers)
App 2739298586487785 → Webhooks → no seletor escolher **Page** (não Messenger/Mensagens) → Callback `https://cordialgestao.com/api/public/meta/leadgen` → Verify token = o mesmo salvo em META_WEBHOOK_VERIFY_TOKEN → Verificar e salvar → assinar o campo **leadgen**. Fazer só depois da etapa 3 passar.

## Riscos
- Publicar leva junto outras mudanças pendentes da prévia (Cordial Bot no topo, histórico do imóvel, Kitnet/Patrocínio) e a publicação estava travada por 10 achados críticos de segurança.
- Se o token salvo for de usuário e não de Página, ler leads pode falhar; aviso com o erro exato.
