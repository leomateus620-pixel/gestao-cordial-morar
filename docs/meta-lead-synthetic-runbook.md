# Lead Ads: teste sintético isolado

A migração `0053_meta_lead_synthetic_isolation.sql` permite testar um único lead de teste autorizado sem distribuir os demais leads do formulário. Não cria formulário, lead, mapeamento geral, anúncio, mensagem ou credencial na Meta. A execução externa precisa de autorização específica e evidência registrada separadamente.

## Preparação e autorização exata

1. Identificar conexão, app, Página, imobiliária e responsável existentes. O responsável deve ser corretor ou administrador elegível da imobiliária, sem `meta_reviewer`; um perfil interno só pode ser escolhido por ele próprio. A conexão permanece a fonte da identidade. Não criar perfil ou mudar papel para viabilizar o teste.
2. Ler o formulário e suas perguntas na Meta. Selecionar finalidade CRM (`compra`, `aluguel` ou `ambos`) a partir desse conteúdo. Não confundir com finalidade do imóvel. Um tipo não identificado não autoriza inferir um imóvel; no teste autorizado, `outro` representa essa ausência explicitamente.
3. Confirmar **zero mapeamentos gerais ativos para esse formulário** antes de criar a submissão sintética. Usar nome contendo `TESTE`, email único em `@example.invalid`, telefone ausente ou marcador textual sintético sem dígitos que normalize para nulo e respostas adicionais identificadas como sintéticas, sem renda ou contato de pessoa real. Se o endpoint ou formulário não permitir esses dados, parar e registrar a limitação; não inserir contato real para contornar a validação. A [execução de 28/10/2026](evidence/meta-lead-live-test-2026-10-28.md) foi recusada pela Meta e permanece sem prova ponta a ponta; não repetir automaticamente.
4. Depois da criação expressamente autorizada, consultar `/FORM_ID/test_leads` com a credencial de Página existente e confirmar o ID retornado no contexto correto. Registrar o horário dessa prova. Esta leitura é diferente da comprovação do recebimento do webhook.
5. Executar `meta_lead_test_authorize` **apenas no backend autorizado**. A RPC não consulta a Meta: ela valida a identidade, o ator, a atribuição, a ausência de mapeamento geral, a prova recente fornecida pelo operador e a expiração. Não expor essa RPC em um controle que aceite IDs arbitrários do navegador.

```sql
SELECT public.meta_lead_test_authorize(
 p_actor := :responsavel_autorizador_uuid,
 p_connection_id := :conexao_uuid,
 p_leadgen_id := :id_exato_confirmado_em_test_leads,
 p_form_id := :formulario_confirmado,
 p_broker_id := :responsavel_uuid,
 p_finalidade := :finalidade_confirmada,
 p_tipo_imovel := :tipo_confirmado,
 p_field_mapping := '{}'::jsonb,
 p_verified_at := :horario_real_da_checagem,
 p_expires_at := now() + interval '1 hour'
);
```

A prova deve ter no máximo 10 minutos e a autorização no máximo 24 horas. Repetir os mesmos parâmetros não cria uma segunda autorização nem prolonga a expiração. Alterar o destinatário de uma identidade já reservada é recusado. Em caso de resultado de criação externo incerto, consultar os testes existentes antes de qualquer novo POST.

## Ordem do webhook e conclusão

O webhook pode chegar antes de conhecermos o ID para autorizar. Como o formulário não tem mapeamento geral, esse evento permanece em revisão ou quarentena. Depois de confirmar a autorização, usar o reprocessamento existente (`meta_lead_retry`) apenas na submissão desse ID. Não fabricar um webhook para declarar que a Meta o entregou: distinguir recebimento real de reentrega local identificada em teste.

O worker mantém HMAC no ingresso, leitura do lead, persistência e lease. A resolução final ocorre **dentro de `meta_lead_complete`**, portanto o worker já publicado que lê os campos padrão `full_name` e `email` também respeita a autorização exata. O worker novo busca o mapeamento por `meta_lead_mapping_for_submission`, com a mesma identidade e lease. Perguntas adicionais ficam em `field_data`; o teste não interpreta uma faixa sintética como renda real.

A transação cria cliente somente quando não existe contato compatível na imobiliária e, em seguida, cria o atendimento com os mesmos cliente, finalidade e responsável. Telefone/email conflitantes, múltiplos contatos ou atendimento aberto seguem para revisão. Um cliente existente nunca tem nome, marca, contato ou responsável sobrescritos pelo importador. O histórico do atendimento e a nota do cliente identificam o teste; a submissão tem `is_synthetic=true`. Não há envio ao contato. Os gatilhos normais de histórico e atribuição continuam ativos; a notificação interna de atribuição ao próprio autor já é dispensada pelo fluxo existente.

Evidências mínimas, sem corpos de lead ou tokens: ID externo de teste; horários de criação Meta, webhook e conclusão; ID de submissão, cliente e atendimento; imobiliária e responsável; estado final; captura autorizada da caixa de entrada. Reentregar o mesmo evento deve conservar uma única submissão e os mesmos IDs de cliente e atendimento. Reexecutar `complete` fora do lease ou depois da conclusão é recusado.

## Encerrar e preservar a evidência

Desabilitar somente a autorização exata (`UPDATE meta_lead_test_authorizations SET enabled=false WHERE id=:autorizacao`) quando o teste terminar. Não apagar automaticamente o teste na Meta, o cliente ou o atendimento: a evidência e a política de retenção determinam essa decisão. Expiração, revogação, troca de contexto da conexão ou retirada da elegibilidade do responsável impedem novas conclusões; uma autorização vencida **não cai em um mapeamento geral criado depois**. Mudança de app/Página/imobiliária desabilita a autorização de forma permanente.

A exclusão pelo fluxo CRM existente conserva a identidade como tombstone com `privacy_deleted_at`: webhook/recovery não ressuscitam a submissão. Não remover essa identidade durante limpeza. Não incluir teste sintético nas alegações de leads reais ou de operação comercial comprovada.

## Validação local

`tests/ads/lead-test-routing.test.ts` aplica as migrações em PostgreSQL PGlite, chama claim/complete sob `service_role` e verifica recusa de leitura/execução sob `authenticated`, inclusive administrador com `meta_reviewer`. Os nove testes cobrem contexto compartilhado e único, chegada antes da autorização, deduplicação, expiração/revogação, mudança de Página, envelope sintético, criação transacional de cliente e bloqueio de ressurreição após exclusão e exclusão de dados sintéticos do funil comercial. São testes simulados identificados; não comprovam webhook ou acesso externo real.
