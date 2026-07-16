
-- Enum de status
DO $$ BEGIN
  CREATE TYPE public.satisfaction_survey_status AS ENUM ('pendente', 'respondida', 'expirada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela: satisfaction_surveys
CREATE TABLE public.satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  corretor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_nome TEXT NOT NULL,
  client_contato TEXT,
  contexto TEXT,
  status public.satisfaction_survey_status NOT NULL DEFAULT 'pendente',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  responded_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_satisfaction_surveys_corretor ON public.satisfaction_surveys(corretor_id);
CREATE INDEX idx_satisfaction_surveys_status ON public.satisfaction_surveys(status);
CREATE INDEX idx_satisfaction_surveys_created ON public.satisfaction_surveys(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.satisfaction_surveys TO authenticated;
GRANT ALL ON public.satisfaction_surveys TO service_role;

ALTER TABLE public.satisfaction_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam surveys"
  ON public.satisfaction_surveys FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Tabela: satisfaction_responses
CREATE TABLE public.satisfaction_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL UNIQUE REFERENCES public.satisfaction_surveys(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL,
  comentario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_satisfaction_responses_created ON public.satisfaction_responses(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.satisfaction_responses TO authenticated;
GRANT ALL ON public.satisfaction_responses TO service_role;

ALTER TABLE public.satisfaction_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam respostas"
  ON public.satisfaction_responses FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Trigger updated_at
CREATE TRIGGER satisfaction_surveys_touch_updated_at
  BEFORE UPDATE ON public.satisfaction_surveys
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Validação de rating via trigger
CREATE OR REPLACE FUNCTION public.satisfaction_validate_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'rating deve estar entre 1 e 5';
  END IF;
  IF NEW.comentario IS NOT NULL AND length(NEW.comentario) > 1000 THEN
    RAISE EXCEPTION 'comentario excede 1000 caracteres';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER satisfaction_responses_validate
  BEFORE INSERT OR UPDATE ON public.satisfaction_responses
  FOR EACH ROW EXECUTE FUNCTION public.satisfaction_validate_rating();

-- Função pública: obter dados da pesquisa por token (sem PII do cliente)
CREATE OR REPLACE FUNCTION public.get_satisfaction_survey_by_token(_token TEXT)
RETURNS TABLE (
  survey_id UUID,
  corretor_nome TEXT,
  corretor_iniciais TEXT,
  contexto TEXT,
  status public.satisfaction_survey_status,
  expired BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id,
         COALESCE(p.nome, '') AS corretor_nome,
         COALESCE(p.iniciais, '') AS corretor_iniciais,
         s.contexto,
         s.status,
         (s.expires_at < now()) AS expired
  FROM public.satisfaction_surveys s
  LEFT JOIN public.profiles p ON p.id = s.corretor_id
  WHERE s.token = _token
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_satisfaction_survey_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_satisfaction_survey_by_token(TEXT) TO anon, authenticated;

-- Função pública: submeter resposta
CREATE OR REPLACE FUNCTION public.submit_satisfaction_response(
  _token TEXT,
  _rating SMALLINT,
  _comentario TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survey public.satisfaction_surveys%ROWTYPE;
BEGIN
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'rating_invalido';
  END IF;
  IF _comentario IS NOT NULL AND length(_comentario) > 1000 THEN
    RAISE EXCEPTION 'comentario_longo';
  END IF;

  SELECT * INTO v_survey FROM public.satisfaction_surveys WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'token_invalido';
  END IF;
  IF v_survey.status <> 'pendente' THEN
    RAISE EXCEPTION 'ja_respondida';
  END IF;
  IF v_survey.expires_at < now() THEN
    UPDATE public.satisfaction_surveys SET status = 'expirada' WHERE id = v_survey.id;
    RAISE EXCEPTION 'expirada';
  END IF;

  INSERT INTO public.satisfaction_responses (survey_id, rating, comentario)
    VALUES (v_survey.id, _rating, NULLIF(trim(_comentario), ''));

  UPDATE public.satisfaction_surveys
    SET status = 'respondida', responded_at = now()
    WHERE id = v_survey.id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_satisfaction_response(TEXT, SMALLINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_satisfaction_response(TEXT, SMALLINT, TEXT) TO anon, authenticated;
