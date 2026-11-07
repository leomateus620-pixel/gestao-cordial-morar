CREATE OR REPLACE VIEW public.morar_site_eligible WITH (security_invoker=true) AS SELECT p.id AS property_id,
    s.public_id,
    s.public_reference,
    s.published_at,
    p.operacao,
    p.tipo,
    NULLIF(NULLIF(btrim(p.cidade), ''::text), '0'::text) AS cidade,
    NULLIF(NULLIF(btrim(p.bairro), ''::text), '0'::text) AS bairro,
    p.uf,
        CASE
            WHEN (p.exibir_endereco_site = 'sim'::text) THEN concat_ws(', '::text, NULLIF(p.logradouro, ''::text), NULLIF(p.numero, ''::text))
            ELSE NULL::text
        END AS endereco,
        CASE
            WHEN ((p.valor_modo = 'fixo'::text) AND (p.valor >= (0)::numeric)) THEN p.valor
            ELSE NULL::numeric
        END AS valor,
    p.valor_modo,
    p.dormitorios,
    p.banheiros,
    p.suites,
    p.vagas,
    morar_site_area_m2(p.area_util, NULL::text, s.area_units_confirmed) AS area_util,
    morar_site_area_m2(p.area_total, p.area_total_unidade, s.area_units_confirmed) AS area_total,
    morar_site_area_m2(p.area_construida, p.area_construida_unidade, s.area_units_confirmed) AS area_construida,
    morar_site_area_m2(p.area_terreno, p.area_terreno_unidade, s.area_units_confirmed) AS area_terreno,
        CASE
            WHEN (lower(p.mobiliado) = ANY (ARRAY['true'::text, 'sim'::text])) THEN true
            WHEN (lower(p.mobiliado) = ANY (ARRAY['false'::text, 'nao'::text, 'não'::text])) THEN false
            ELSE NULL::boolean
        END AS mobiliado,
    p.permuta,
    p.aceita_financiamento,
    p.estagio_empreendimento,
    p.destaque_inicial,
        CASE
            WHEN morar_site_has_hidden_address(p.*, p.descricao_imovel) THEN ''::text
            ELSE p.descricao_imovel
        END AS descricao_imovel,
        CASE
            WHEN morar_site_has_hidden_address(p.*, p.pontos_fortes) THEN NULL::text
            ELSE p.pontos_fortes
        END AS pontos_fortes,
    morar_site_public_features(p.*) AS caracteristicas
   FROM (properties p
     JOIN morar_site_publications s ON ((s.property_id = p.id)))
  WHERE ((s.state = 'published'::text) AND ((s.admin_release_at IS NOT NULL) OR ((s.morar_authorized IS TRUE) AND (s.availability_confirmed IS TRUE))) AND (s.manual_withdrawn IS FALSE) AND (s.published_at IS NOT NULL) AND (s.reviewed_content_hash = morar_site_content_hash(p.*)) AND (p.is_draft IS FALSE) AND (p.exibir_imovel IS TRUE) AND (p.archived_at IS NULL) AND (p.removal_state IS NULL) AND ((s.admin_release_at IS NOT NULL) OR (p.source IS DISTINCT FROM 'gestao_cordial'::text) OR (p.registration_completed_at IS NOT NULL)) AND ((s.admin_release_at IS NOT NULL) OR (p.autorizacao IS DISTINCT FROM false)) AND ((p.disponibilidade IS NULL) OR (lower(btrim(p.disponibilidade)) = ANY (ARRAY['sim'::text, 'disponivel'::text, 'disponível'::text]))) AND (p.operacao = ANY (ARRAY['venda'::text, 'aluguel'::text])));
CREATE OR REPLACE VIEW public.cordial_site_eligible WITH (security_invoker=true) AS SELECT p.id AS property_id,
    s.public_id,
    s.public_reference,
    s.published_at,
    p.operacao,
    p.tipo,
    NULLIF(NULLIF(btrim(p.cidade), ''::text), '0'::text) AS cidade,
    NULLIF(NULLIF(btrim(p.bairro), ''::text), '0'::text) AS bairro,
    p.uf,
    NULL::text AS endereco,
        CASE
            WHEN ((p.valor_modo = 'fixo'::text) AND (p.valor >= (0)::numeric)) THEN p.valor
            ELSE NULL::numeric
        END AS valor,
    p.valor_modo,
    p.dormitorios,
    p.banheiros,
    p.suites,
    p.vagas,
        CASE
            WHEN s.area_units_confirmed THEN p.area_util
            ELSE NULL::numeric
        END AS area_util,
        CASE
            WHEN s.area_units_confirmed THEN p.area_total
            ELSE NULL::numeric
        END AS area_total,
        CASE
            WHEN s.area_units_confirmed THEN p.area_construida
            ELSE NULL::numeric
        END AS area_construida,
        CASE
            WHEN s.area_units_confirmed THEN p.area_terreno
            ELSE NULL::numeric
        END AS area_terreno,
        CASE
            WHEN (lower(p.mobiliado) = ANY (ARRAY['true'::text, 'sim'::text])) THEN true
            WHEN (lower(p.mobiliado) = ANY (ARRAY['false'::text, 'nao'::text, 'não'::text])) THEN false
            ELSE NULL::boolean
        END AS mobiliado,
    p.permuta,
    p.aceita_financiamento,
    p.estagio_empreendimento,
    p.destaque_inicial,
        CASE
            WHEN cordial_site_has_hidden_address(p.*, p.descricao_imovel) THEN ''::text
            ELSE p.descricao_imovel
        END AS descricao_imovel,
        CASE
            WHEN cordial_site_has_hidden_address(p.*, p.pontos_fortes) THEN NULL::text
            ELSE p.pontos_fortes
        END AS pontos_fortes,
    cordial_site_public_features(p.*) AS caracteristicas
   FROM (properties p
     JOIN cordial_site_publications s ON ((s.property_id = p.id)))
  WHERE ((s.state = 'published'::text) AND ((s.admin_release_at IS NOT NULL) OR ((s.cordial_authorized IS TRUE) AND (s.availability_confirmed IS TRUE))) AND (s.published_at IS NOT NULL) AND (s.reviewed_content_hash = cordial_site_content_hash(p.*)) AND (p.is_draft IS FALSE) AND (p.exibir_imovel IS TRUE) AND (p.archived_at IS NULL) AND (p.removal_state IS NULL) AND ((s.admin_release_at IS NOT NULL) OR (p.autorizacao IS DISTINCT FROM false)) AND ((p.disponibilidade IS NULL) OR (lower(btrim(p.disponibilidade)) = ANY (ARRAY['sim'::text, 'disponivel'::text, 'disponível'::text]))) AND (p.operacao = ANY (ARRAY['venda'::text, 'aluguel'::text])));