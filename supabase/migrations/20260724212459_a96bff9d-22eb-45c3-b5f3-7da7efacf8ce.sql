
INSERT INTO public.attendances (
  id, created_by, imobiliaria, cliente_id, cliente_nome, telefone, email,
  contato_preferencial, origem, finalidade, tipo_imovel, dormitorios,
  bairro_interesse, orcamento_min, orcamento_max,
  corretor_id, corretor_nome, prioridade, status, pipeline_stage,
  proximo_retorno, proximo_passo, observacoes, historico_inicial,
  convertido_em_cliente, cliente_convertido_id, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  c.created_by,
  c.brand,
  c.id,
  c.full_name,
  COALESCE(NULLIF(c.phone,''), 'não informado'),
  c.email,
  COALESCE(c.contact_preference, 'whatsapp'),
  COALESCE(c.lead_origin, 'outro'),
  CASE
    WHEN c.purpose IN ('locacao','aluguel') THEN 'aluguel'
    WHEN c.purpose IN ('venda','compra') THEN 'compra'
    ELSE 'ambos'
  END,
  COALESCE(c.property_type, 'outro'),
  c.bedrooms,
  c.neighborhood,
  c.min_budget,
  c.max_budget,
  CASE
    WHEN c.assigned_broker_id = 'ricardo' THEN '87e85211-12a8-4f1a-bce2-73eddd1cedad'
    WHEN c.assigned_broker_id = 'bianca'  THEN 'b06a522f-65b4-4e2a-8bb4-e9e1f0675b75'
    WHEN c.assigned_broker_id = 'a_definir' THEN NULL
    WHEN c.assigned_broker_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN c.assigned_broker_id
    ELSE NULL
  END,
  CASE
    WHEN c.assigned_broker_id = 'a_definir' THEN NULL
    WHEN c.assigned_broker_id = 'ricardo' THEN 'Ricardo Caetano'
    WHEN c.assigned_broker_id = 'bianca'  THEN 'Bianca Regina'
    ELSE c.assigned_broker_name
  END,
  'media',
  COALESCE(c.status, 'novo'),
  CASE COALESCE(c.status,'novo')
    WHEN 'novo' THEN 'primeiro_contato'::public.pipeline_stage
    WHEN 'aguardando_retorno' THEN 'primeiro_contato'::public.pipeline_stage
    WHEN 'sem_retorno' THEN 'primeiro_contato'::public.pipeline_stage
    WHEN 'em_atendimento' THEN 'apresentando_solucao'::public.pipeline_stage
    WHEN 'visita_agendada' THEN 'visita'::public.pipeline_stage
    WHEN 'proposta_enviada' THEN 'proposta'::public.pipeline_stage
    WHEN 'negociacao' THEN 'proposta'::public.pipeline_stage
    WHEN 'fechado' THEN 'fechamento'::public.pipeline_stage
    WHEN 'perdido' THEN 'perdido'::public.pipeline_stage
    WHEN 'arquivado' THEN 'arquivado'::public.pipeline_stage
    ELSE 'primeiro_contato'::public.pipeline_stage
  END,
  c.next_follow_up_at,
  CASE
    WHEN c.next_step IN ('ligar_cliente','enviar_whatsapp','enviar_opcoes','agendar_visita','fazer_proposta','aguardar_cliente','encaminhar_corretor','outro') THEN c.next_step
    ELSE NULL
  END,
  NULLIF(
    trim(BOTH E'\n' FROM
      COALESCE(c.notes,'') ||
      CASE
        WHEN c.next_step IS NOT NULL AND c.next_step NOT IN ('ligar_cliente','enviar_whatsapp','enviar_opcoes','agendar_visita','fazer_proposta','aguardar_cliente','encaminhar_corretor','outro')
          THEN E'\nPróximo passo: ' || c.next_step
        ELSE ''
      END ||
      CASE WHEN c.restrictions IS NOT NULL THEN E'\nRestrições: ' || c.restrictions ELSE '' END ||
      CASE WHEN c.profession IS NOT NULL THEN E'\nProfissão: ' || c.profession ELSE '' END ||
      CASE WHEN c.approximate_income IS NOT NULL THEN E'\nRenda aproximada: ' || c.approximate_income::text ELSE '' END
    ),
    ''
  ),
  'Migrado do cadastro de Clientes',
  true,
  c.id,
  c.created_at,
  now()
FROM public.clients c
WHERE NOT EXISTS (
  SELECT 1 FROM public.attendances a WHERE a.cliente_id = c.id
);
