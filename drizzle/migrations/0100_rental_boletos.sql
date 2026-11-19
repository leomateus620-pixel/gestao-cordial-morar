CREATE TABLE public.rental_boletos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.rental_contracts(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  brand text NOT NULL CHECK (brand IN ('cordial','morar')),
  ambiente text NOT NULL CHECK (ambiente IN ('sandbox','producao')),
  competencia text NOT NULL CHECK (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ocorrencia integer NOT NULL CHECK (ocorrencia BETWEEN 1 AND 99),
  seu_numero text NOT NULL CHECK (seu_numero ~ '^[0-9A-Z]{10}$'),
  id_titulo_empresa text NOT NULL CHECK (id_titulo_empresa ~ '^[0-9A-Z]{1,25}$'),
  estado text NOT NULL DEFAULT 'preparando' CHECK (estado IN ('preparando','enviando','registrado','incerto','rejeitado','baixa_solicitada','baixado','liquidado')),
  pdf_estado text NOT NULL DEFAULT 'pendente' CHECK (pdf_estado IN ('pendente','pronto','erro')),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  total_centavos bigint NOT NULL CHECK (total_centavos > 0),
  vencimento date NOT NULL,
  nosso_numero text CHECK (nosso_numero ~ '^[0-9]{1,20}$'),
  linha_digitavel text CHECK (linha_digitavel ~ '^[0-9]{47}$'),
  codigo_barras text CHECK (codigo_barras ~ '^[0-9]{44}$'),
  linha_validada boolean,
  pdf_path text CHECK (pdf_path IS NULL OR (pdf_path LIKE contract_id::text || '/boletos/%' AND position('..' in pdf_path) = 0)),
  situacao_banco text CHECK (char_length(situacao_banco) <= 80),
  liquidacao_evidencia jsonb,
  ultimo_erro text CHECK (char_length(ultimo_erro) <= 400),
  emission_id uuid REFERENCES public.rental_emissions(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.rental_boletos IS 'Sicredi rent boletos. Written only by the server (service role) through rental_boleto_prepare / rental_boleto_transition; snapshot is immutable.';
CREATE UNIQUE INDEX rental_boletos_occurrence_key ON public.rental_boletos (contract_id, competencia, ambiente, ocorrencia);
CREATE UNIQUE INDEX rental_boletos_one_live_key ON public.rental_boletos (contract_id, competencia, ambiente)
  WHERE estado NOT IN ('rejeitado','baixado');
CREATE UNIQUE INDEX rental_boletos_seu_numero_key ON public.rental_boletos (account_id, seu_numero);
CREATE UNIQUE INDEX rental_boletos_nosso_numero_key ON public.rental_boletos (account_id, ambiente, nosso_numero)
  WHERE nosso_numero IS NOT NULL;
CREATE INDEX rental_boletos_contract_idx ON public.rental_boletos (contract_id, competencia, created_at DESC);
GRANT SELECT ON public.rental_boletos TO authenticated;
GRANT ALL ON public.rental_boletos TO service_role;
ALTER TABLE public.rental_boletos ENABLE ROW LEVEL SECURITY;
CREATE POLICY rental_boletos_select ON public.rental_boletos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = contract_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY meta_reviewer_block ON public.rental_boletos AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public.rental_boletos AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());

CREATE TABLE public.rental_boleto_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boleto_id uuid NOT NULL REFERENCES public.rental_boletos(id) ON DELETE RESTRICT,
  de text,
  para text NOT NULL,
  actor uuid,
  http_status integer,
  mensagem text CHECK (char_length(mensagem) <= 300),
  detalhe jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rental_boleto_events_boleto_idx ON public.rental_boleto_events (boleto_id, created_at);
GRANT SELECT ON public.rental_boleto_events TO authenticated;
GRANT ALL ON public.rental_boleto_events TO service_role;
ALTER TABLE public.rental_boleto_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY rental_boleto_events_select ON public.rental_boleto_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_boletos b JOIN public.rental_contracts c ON c.id = b.contract_id
    WHERE b.id = boleto_id AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY meta_reviewer_block ON public.rental_boleto_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public.rental_boleto_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());

CREATE OR REPLACE FUNCTION public.rental_boletos_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'rental boletos are permanent history' USING ERRCODE = '42501';
  END IF;
  IF NEW.contract_id IS DISTINCT FROM OLD.contract_id OR NEW.account_id IS DISTINCT FROM OLD.account_id
     OR NEW.brand IS DISTINCT FROM OLD.brand OR NEW.ambiente IS DISTINCT FROM OLD.ambiente
     OR NEW.competencia IS DISTINCT FROM OLD.competencia OR NEW.ocorrencia IS DISTINCT FROM OLD.ocorrencia
     OR NEW.seu_numero IS DISTINCT FROM OLD.seu_numero OR NEW.id_titulo_empresa IS DISTINCT FROM OLD.id_titulo_empresa
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.total_centavos IS DISTINCT FROM OLD.total_centavos
     OR NEW.vencimento IS DISTINCT FROM OLD.vencimento OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'rental boleto identity and snapshot are immutable' USING ERRCODE = '42501';
  END IF;
  IF (OLD.nosso_numero IS NOT NULL AND NEW.nosso_numero IS DISTINCT FROM OLD.nosso_numero)
     OR (OLD.linha_digitavel IS NOT NULL AND NEW.linha_digitavel IS DISTINCT FROM OLD.linha_digitavel)
     OR (OLD.codigo_barras IS NOT NULL AND NEW.codigo_barras IS DISTINCT FROM OLD.codigo_barras) THEN
    RAISE EXCEPTION 'registered boleto identifiers are immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.estado <> OLD.estado AND NOT (
       (OLD.estado = 'preparando' AND NEW.estado IN ('enviando','rejeitado'))
    OR (OLD.estado = 'enviando' AND NEW.estado IN ('registrado','rejeitado','incerto'))
    OR (OLD.estado = 'incerto' AND NEW.estado IN ('registrado','rejeitado'))
    OR (OLD.estado = 'registrado' AND NEW.estado IN ('baixa_solicitada','baixado','liquidado'))
    OR (OLD.estado = 'baixa_solicitada' AND NEW.estado IN ('registrado','baixado','liquidado'))
  ) THEN
    RAISE EXCEPTION 'invalid boleto transition % -> %', OLD.estado, NEW.estado USING ERRCODE = '23514';
  END IF;
  IF NEW.estado IN ('registrado','baixa_solicitada','baixado','liquidado')
     AND (NEW.nosso_numero IS NULL OR NEW.linha_digitavel IS NULL OR NEW.codigo_barras IS NULL) THEN
    RAISE EXCEPTION 'registered boleto needs bank identifiers' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER rental_boletos_guard BEFORE UPDATE OR DELETE ON public.rental_boletos
  FOR EACH ROW EXECUTE FUNCTION public.rental_boletos_guard();

CREATE OR REPLACE FUNCTION public.rental_boleto_events_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'boleto events are append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER rental_boleto_events_append_only BEFORE UPDATE OR DELETE ON public.rental_boleto_events
  FOR EACH ROW EXECUTE FUNCTION public.rental_boleto_events_append_only();

-- Mirror of src/lib/boleto/sicredi/seu-numero.ts: base36 of the first 51 bits of
-- SHA-256('<contract>:<AAAA-MM>:<ocorrencia>'), 10 characters.
CREATE OR REPLACE FUNCTION public.rental_boleto_seu_numero(_contract uuid, _competencia text, _ocorrencia integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  h text := encode(sha256(convert_to(lower(_contract::text) || ':' || _competencia || ':' || _ocorrencia::text, 'UTF8')), 'hex');
  v bigint := (('x' || lpad(substr(h, 1, 13), 16, '0'))::bit(64)::bigint) >> 1;
  alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  result text := '';
BEGIN
  IF v = 0 THEN result := '0'; END IF;
  WHILE v > 0 LOOP
    result := substr(alphabet, (v % 36)::integer + 1, 1) || result;
    v := v / 36;
  END LOOP;
  RETURN lpad(result, 10, '0');
END $$;

CREATE OR REPLACE FUNCTION public.rental_boleto_prepare(
  _contract_id uuid, _account_id uuid, _competencia text, _snapshot jsonb,
  _total_centavos bigint, _vencimento date, _actor uuid)
RETURNS TABLE(out_id uuid, out_estado text, out_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  acc public.billing_accounts%ROWTYPE;
  live_id uuid;
  live_estado text;
  next_oc integer;
  seu text;
  new_id uuid;
BEGIN
  SELECT * INTO acc FROM public.billing_accounts a WHERE a.id = _account_id;
  IF NOT FOUND OR NOT acc.configurado THEN
    RAISE EXCEPTION 'billing account not configured' USING ERRCODE = '42501';
  END IF;
  IF acc.ambiente = 'producao' AND (NOT acc.emissao_habilitada OR acc.consulta_ok_em IS NULL) THEN
    RAISE EXCEPTION 'production issuance disabled' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rental_contracts c WHERE c.id = _contract_id AND c.brand::text = acc.brand) THEN
    RAISE EXCEPTION 'contract brand mismatch' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rental_boleto:' || _contract_id::text || ':' || _competencia || ':' || acc.ambiente, 0));
  SELECT b.id, b.estado INTO live_id, live_estado FROM public.rental_boletos b
    WHERE b.contract_id = _contract_id AND b.competencia = _competencia AND b.ambiente = acc.ambiente
      AND b.estado NOT IN ('rejeitado','baixado')
    ORDER BY b.ocorrencia DESC LIMIT 1;
  IF live_id IS NOT NULL THEN
    RETURN QUERY SELECT live_id, live_estado, false;
    RETURN;
  END IF;
  SELECT coalesce(max(b.ocorrencia), 0) + 1 INTO next_oc FROM public.rental_boletos b
    WHERE b.contract_id = _contract_id AND b.competencia = _competencia AND b.ambiente = acc.ambiente;
  seu := public.rental_boleto_seu_numero(_contract_id, _competencia, next_oc);
  INSERT INTO public.rental_boletos (contract_id, account_id, brand, ambiente, competencia, ocorrencia,
    seu_numero, id_titulo_empresa, snapshot, total_centavos, vencimento, created_by)
  VALUES (_contract_id, _account_id, acc.brand, acc.ambiente, _competencia, next_oc,
    seu, seu || replace(_competencia, '-', ''), _snapshot, _total_centavos, _vencimento, _actor)
  RETURNING id INTO new_id;
  INSERT INTO public.rental_boleto_events (boleto_id, de, para, actor, mensagem, detalhe)
  VALUES (new_id, NULL, 'preparando', _actor, 'Boleto preparado',
    jsonb_build_object('vencimento_alterado', coalesce((_snapshot->'vencimento'->>'alterado')::boolean, false),
                       'vencimento_original', _snapshot->'vencimento'->>'original'));
  RETURN QUERY SELECT new_id, 'preparando'::text, true;
END $$;

CREATE OR REPLACE FUNCTION public.rental_boleto_transition(
  _id uuid, _from text[], _to text, _patch jsonb, _actor uuid,
  _http integer DEFAULT NULL, _mensagem text DEFAULT NULL, _detalhe jsonb DEFAULT '{}'::jsonb)
RETURNS SETOF public.rental_boletos
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  old_estado text;
  r public.rental_boletos%ROWTYPE;
  p jsonb := coalesce(_patch, '{}'::jsonb);
BEGIN
  SELECT b.estado INTO old_estado FROM public.rental_boletos b
    WHERE b.id = _id AND b.estado = ANY(_from) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE public.rental_boletos b SET
    estado = _to,
    nosso_numero = coalesce(p->>'nosso_numero', b.nosso_numero),
    linha_digitavel = coalesce(p->>'linha_digitavel', b.linha_digitavel),
    codigo_barras = coalesce(p->>'codigo_barras', b.codigo_barras),
    linha_validada = coalesce((p->>'linha_validada')::boolean, b.linha_validada),
    pdf_estado = coalesce(p->>'pdf_estado', b.pdf_estado),
    pdf_path = coalesce(p->>'pdf_path', b.pdf_path),
    situacao_banco = coalesce(p->>'situacao_banco', b.situacao_banco),
    liquidacao_evidencia = coalesce(p->'liquidacao_evidencia', b.liquidacao_evidencia),
    ultimo_erro = CASE WHEN p ? 'ultimo_erro' THEN p->>'ultimo_erro' ELSE b.ultimo_erro END,
    emission_id = coalesce((p->>'emission_id')::uuid, b.emission_id)
  WHERE b.id = _id
  RETURNING b.* INTO r;
  INSERT INTO public.rental_boleto_events (boleto_id, de, para, actor, http_status, mensagem, detalhe)
  VALUES (_id, old_estado, _to, _actor, _http, left(_mensagem, 300), coalesce(_detalhe, '{}'::jsonb));
  RETURN NEXT r;
END $$;

REVOKE ALL ON FUNCTION public.rental_boleto_seu_numero(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rental_boleto_prepare(uuid, uuid, text, jsonb, bigint, date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rental_boleto_transition(uuid, text[], text, jsonb, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rental_boleto_seu_numero(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rental_boleto_prepare(uuid, uuid, text, jsonb, bigint, date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rental_boleto_transition(uuid, text[], text, jsonb, uuid, integer, text, jsonb) TO service_role;