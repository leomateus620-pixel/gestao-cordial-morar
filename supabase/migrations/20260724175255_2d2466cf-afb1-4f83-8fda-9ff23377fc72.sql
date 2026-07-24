
-- 1. Pipeline stage enum
DO $$ BEGIN
  CREATE TYPE public.pipeline_stage AS ENUM (
    'primeiro_contato',
    'apresentando_solucao',
    'visita',
    'proposta',
    'fechamento',
    'perdido',
    'arquivado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Add column
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS pipeline_stage public.pipeline_stage;

-- 3. Backfill from status
UPDATE public.attendances SET pipeline_stage = CASE
  WHEN status IN ('novo','aguardando_retorno','sem_retorno') THEN 'primeiro_contato'::public.pipeline_stage
  WHEN status = 'em_atendimento' THEN 'apresentando_solucao'::public.pipeline_stage
  WHEN status = 'visita_agendada' THEN 'visita'::public.pipeline_stage
  WHEN status IN ('proposta_enviada','negociacao') THEN 'proposta'::public.pipeline_stage
  WHEN status = 'fechado' THEN 'fechamento'::public.pipeline_stage
  WHEN status = 'perdido' THEN 'perdido'::public.pipeline_stage
  WHEN status = 'arquivado' THEN 'arquivado'::public.pipeline_stage
  ELSE 'primeiro_contato'::public.pipeline_stage
END WHERE pipeline_stage IS NULL;

ALTER TABLE public.attendances
  ALTER COLUMN pipeline_stage SET DEFAULT 'primeiro_contato'::public.pipeline_stage;
ALTER TABLE public.attendances
  ALTER COLUMN pipeline_stage SET NOT NULL;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_attendances_pipeline_stage ON public.attendances(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_attendances_corretor_stage ON public.attendances(corretor_id, pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_attendances_proximo_retorno ON public.attendances(proximo_retorno);
CREATE INDEX IF NOT EXISTS idx_attendances_cliente_id ON public.attendances(cliente_id);

-- 5. attendance_history table
CREATE TABLE IF NOT EXISTS public.attendance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.attendances(id) ON DELETE CASCADE,
  client_id UUID,
  event_type TEXT NOT NULL,
  actor_id UUID,
  actor_name TEXT,
  description TEXT,
  previous_value JSONB,
  new_value JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'trigger',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_history_attendance ON public.attendance_history(attendance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_history_client ON public.attendance_history(client_id, created_at DESC);

GRANT SELECT ON public.attendance_history TO authenticated;
GRANT ALL ON public.attendance_history TO service_role;

ALTER TABLE public.attendance_history ENABLE ROW LEVEL SECURITY;

-- Helper: quem pode ver o atendimento pode ver o histórico
CREATE OR REPLACE FUNCTION public.attendance_can_access(_attendance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.attendances a
    WHERE a.id = _attendance_id
      AND (
        a.created_by = auth.uid()
        OR a.corretor_id = auth.uid()::text
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
      )
  );
$$;

DROP POLICY IF EXISTS "history_select" ON public.attendance_history;
CREATE POLICY "history_select" ON public.attendance_history
  FOR SELECT TO authenticated
  USING (public.attendance_can_access(attendance_id));

-- Sem INSERT/UPDATE/DELETE policies → só security-definer trigger e service_role gravam.

-- 6. Trigger para registrar histórico automaticamente
CREATE OR REPLACE FUNCTION public.attendances_log_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_name TEXT;
BEGIN
  SELECT nome INTO v_actor_name FROM public.profiles WHERE id = v_actor;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.attendance_history (attendance_id, client_id, event_type, actor_id, actor_name, description, new_value)
    VALUES (NEW.id, NEW.cliente_id, 'criacao', v_actor, v_actor_name,
      'Atendimento criado.',
      jsonb_build_object('status', NEW.status, 'pipeline_stage', NEW.pipeline_stage, 'corretor_id', NEW.corretor_id));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
      INSERT INTO public.attendance_history (attendance_id, client_id, event_type, actor_id, actor_name, description, previous_value, new_value)
      VALUES (NEW.id, NEW.cliente_id, 'stage_change', v_actor, v_actor_name,
        'Etapa do funil alterada.',
        jsonb_build_object('pipeline_stage', OLD.pipeline_stage),
        jsonb_build_object('pipeline_stage', NEW.pipeline_stage));
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.attendance_history (attendance_id, client_id, event_type, actor_id, actor_name, description, previous_value, new_value)
      VALUES (NEW.id, NEW.cliente_id, 'status_change', v_actor, v_actor_name,
        'Status detalhado alterado.',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status));
    END IF;
    IF NEW.corretor_id IS DISTINCT FROM OLD.corretor_id THEN
      INSERT INTO public.attendance_history (attendance_id, client_id, event_type, actor_id, actor_name, description, previous_value, new_value)
      VALUES (NEW.id, NEW.cliente_id, 'broker_change', v_actor, v_actor_name,
        COALESCE('Corretor: ' || NEW.corretor_nome, 'Corretor alterado.'),
        jsonb_build_object('corretor_id', OLD.corretor_id, 'corretor_nome', OLD.corretor_nome),
        jsonb_build_object('corretor_id', NEW.corretor_id, 'corretor_nome', NEW.corretor_nome));
    END IF;
    IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
      INSERT INTO public.attendance_history (attendance_id, client_id, event_type, actor_id, actor_name, description, previous_value, new_value)
      VALUES (NEW.id, NEW.cliente_id, 'client_link', v_actor, v_actor_name,
        'Cliente vinculado ao atendimento.',
        jsonb_build_object('cliente_id', OLD.cliente_id),
        jsonb_build_object('cliente_id', NEW.cliente_id));
    END IF;
    IF NEW.imovel_id IS DISTINCT FROM OLD.imovel_id THEN
      INSERT INTO public.attendance_history (attendance_id, client_id, event_type, actor_id, actor_name, description, previous_value, new_value)
      VALUES (NEW.id, NEW.cliente_id, 'property_link', v_actor, v_actor_name,
        'Imóvel de interesse atualizado.',
        jsonb_build_object('imovel_id', OLD.imovel_id, 'imovel_descricao', OLD.imovel_descricao),
        jsonb_build_object('imovel_id', NEW.imovel_id, 'imovel_descricao', NEW.imovel_descricao));
    END IF;
    IF NEW.proximo_retorno IS DISTINCT FROM OLD.proximo_retorno THEN
      INSERT INTO public.attendance_history (attendance_id, client_id, event_type, actor_id, actor_name, description, previous_value, new_value)
      VALUES (NEW.id, NEW.cliente_id, 'next_return', v_actor, v_actor_name,
        'Próximo retorno alterado.',
        jsonb_build_object('proximo_retorno', OLD.proximo_retorno),
        jsonb_build_object('proximo_retorno', NEW.proximo_retorno));
    END IF;
    IF NEW.proximo_passo IS DISTINCT FROM OLD.proximo_passo THEN
      INSERT INTO public.attendance_history (attendance_id, client_id, event_type, actor_id, actor_name, description, previous_value, new_value)
      VALUES (NEW.id, NEW.cliente_id, 'next_action', v_actor, v_actor_name,
        'Próximo passo definido.',
        jsonb_build_object('proximo_passo', OLD.proximo_passo),
        jsonb_build_object('proximo_passo', NEW.proximo_passo));
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendances_history_ins ON public.attendances;
CREATE TRIGGER trg_attendances_history_ins
  AFTER INSERT ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.attendances_log_history();

DROP TRIGGER IF EXISTS trg_attendances_history_upd ON public.attendances;
CREATE TRIGGER trg_attendances_history_upd
  AFTER UPDATE ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.attendances_log_history();

-- 7. RPC para registrar nota livre no histórico
CREATE OR REPLACE FUNCTION public.attendance_add_note(_attendance_id UUID, _texto TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_name TEXT;
  v_client UUID;
  v_id UUID;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.attendance_can_access(_attendance_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _texto IS NULL OR length(trim(_texto)) = 0 THEN
    RAISE EXCEPTION 'empty_note';
  END IF;
  SELECT nome INTO v_actor_name FROM public.profiles WHERE id = v_actor;
  SELECT cliente_id INTO v_client FROM public.attendances WHERE id = _attendance_id;
  INSERT INTO public.attendance_history (attendance_id, client_id, event_type, actor_id, actor_name, description, source)
  VALUES (_attendance_id, v_client, 'note', v_actor, v_actor_name, trim(_texto), 'manual')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.attendance_can_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_add_note(UUID, TEXT) TO authenticated;
