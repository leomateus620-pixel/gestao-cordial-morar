
-- 1. Enum for assignment status
DO $$ BEGIN
  CREATE TYPE public.attendance_assignment_status AS ENUM ('pending_open','opened','superseded','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Table
CREATE TABLE IF NOT EXISTS public.attendance_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES public.attendances(id) ON DELETE CASCADE,
  broker_id UUID NOT NULL,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  first_opened_at TIMESTAMPTZ,
  first_opened_by UUID,
  response_time_seconds INTEGER,
  status public.attendance_assignment_status NOT NULL DEFAULT 'pending_open',
  superseded_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  imobiliaria TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Grants — direct SELECT restricted to service_role; all client access via RPC
GRANT ALL ON public.attendance_assignments TO service_role;
GRANT SELECT ON public.attendance_assignments TO authenticated;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_assign_attendance ON public.attendance_assignments(attendance_id);
CREATE INDEX IF NOT EXISTS idx_assign_broker_status ON public.attendance_assignments(broker_id, status);
CREATE INDEX IF NOT EXISTS idx_assign_status ON public.attendance_assignments(status);
CREATE INDEX IF NOT EXISTS idx_assign_assigned_at ON public.attendance_assignments(assigned_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assign_one_active_per_attendance
  ON public.attendance_assignments(attendance_id)
  WHERE status = 'pending_open';

-- 5. Enable RLS
ALTER TABLE public.attendance_assignments ENABLE ROW LEVEL SECURITY;

-- 6. Policies: only admin + secretaria SELECT the row (all timing fields).
--    Brokers do NOT read this table — they call the RPC to close their own timer,
--    which uses SECURITY DEFINER and never returns timing fields to them.
DROP POLICY IF EXISTS assign_select_management ON public.attendance_assignments;
CREATE POLICY assign_select_management
  ON public.attendance_assignments FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  );

-- No INSERT/UPDATE/DELETE policies → client mutations blocked. Only service_role
-- and SECURITY DEFINER functions (which own privileges) can write.

-- 7. updated_at trigger
DROP TRIGGER IF EXISTS assign_touch_updated_at ON public.attendance_assignments;
CREATE TRIGGER assign_touch_updated_at
  BEFORE UPDATE ON public.attendance_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 8. Helper: safely cast text corretor_id to uuid
CREATE OR REPLACE FUNCTION public._try_uuid(_txt TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _txt IS NULL OR trim(_txt) = '' THEN RETURN NULL; END IF;
  RETURN _txt::uuid;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

-- 9. Trigger on attendances → maintain assignments
CREATE OR REPLACE FUNCTION public.attendances_sync_assignments()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_broker UUID;
  v_old_broker UUID;
  v_actor UUID := auth.uid();
BEGIN
  v_new_broker := public._try_uuid(NEW.corretor_id);

  IF TG_OP = 'INSERT' THEN
    IF v_new_broker IS NOT NULL THEN
      INSERT INTO public.attendance_assignments
        (attendance_id, broker_id, assigned_by, assigned_at, imobiliaria)
      VALUES (NEW.id, v_new_broker, COALESCE(v_actor, NEW.created_by), now(), NEW.imobiliaria);

      INSERT INTO public.attendance_history
        (attendance_id, client_id, event_type, actor_id, description, new_value, source)
      VALUES (NEW.id, NEW.cliente_id, 'assignment_created', v_actor,
        'Atendimento atribuído ao corretor.',
        jsonb_build_object('broker_id', v_new_broker::text), 'trigger');
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old_broker := public._try_uuid(OLD.corretor_id);
    IF v_new_broker IS DISTINCT FROM v_old_broker THEN
      -- Retire old active assignment (if it was still pending_open)
      UPDATE public.attendance_assignments
        SET status = CASE WHEN v_new_broker IS NULL THEN 'cancelled'::public.attendance_assignment_status
                          ELSE 'superseded'::public.attendance_assignment_status END,
            superseded_at = CASE WHEN v_new_broker IS NOT NULL THEN now() ELSE NULL END,
            cancelled_at  = CASE WHEN v_new_broker IS NULL THEN now() ELSE NULL END
        WHERE attendance_id = NEW.id AND status = 'pending_open';

      IF v_new_broker IS NOT NULL THEN
        INSERT INTO public.attendance_assignments
          (attendance_id, broker_id, assigned_by, assigned_at, imobiliaria)
        VALUES (NEW.id, v_new_broker, COALESCE(v_actor, NEW.created_by), now(), NEW.imobiliaria);

        INSERT INTO public.attendance_history
          (attendance_id, client_id, event_type, actor_id, description, previous_value, new_value, source)
        VALUES (NEW.id, NEW.cliente_id, 'assignment_created', v_actor,
          'Nova atribuição de corretor iniciada.',
          jsonb_build_object('broker_id', v_old_broker::text),
          jsonb_build_object('broker_id', v_new_broker::text),
          'trigger');
      ELSE
        INSERT INTO public.attendance_history
          (attendance_id, client_id, event_type, actor_id, description, previous_value, source)
        VALUES (NEW.id, NEW.cliente_id, 'assignment_cancelled', v_actor,
          'Atribuição de corretor removida.',
          jsonb_build_object('broker_id', v_old_broker::text), 'trigger');
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendances_sync_assignments_trg ON public.attendances;
CREATE TRIGGER attendances_sync_assignments_trg
  AFTER INSERT OR UPDATE OF corretor_id ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.attendances_sync_assignments();

-- 10. Canonical first-open mutation (idempotent, broker-only)
CREATE OR REPLACE FUNCTION public.mark_attendance_first_opened(_attendance_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_assign public.attendance_assignments%ROWTYPE;
  v_att   public.attendances%ROWTYPE;
  v_corretor_nome TEXT;
  v_titulo TEXT;
  v_mensagem TEXT;
  v_link TEXT;
  v_seconds INTEGER;
  v_admin RECORD;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;

  SELECT * INTO v_assign FROM public.attendance_assignments
    WHERE attendance_id = _attendance_id AND status = 'pending_open'
    FOR UPDATE;

  IF NOT FOUND THEN
    -- Idempotent: nothing pending. Might already be opened.
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  -- Only the assigned broker closes the timer
  IF v_assign.broker_id <> v_uid THEN
    RETURN jsonb_build_object('ok', true, 'noop', true, 'reason', 'not_broker');
  END IF;

  v_seconds := GREATEST(0, EXTRACT(EPOCH FROM (now() - v_assign.assigned_at))::int);

  UPDATE public.attendance_assignments
    SET status = 'opened',
        first_opened_at = now(),
        first_opened_by = v_uid,
        response_time_seconds = v_seconds
    WHERE id = v_assign.id;

  -- Mirror to attendances.opened_at for backward compat
  UPDATE public.attendances
    SET opened_at = now(), opened_by = v_uid
    WHERE id = _attendance_id AND opened_at IS NULL;

  SELECT * INTO v_att FROM public.attendances WHERE id = _attendance_id;
  SELECT COALESCE(p.nome, v_att.corretor_nome, 'Corretor') INTO v_corretor_nome
    FROM public.profiles p WHERE p.id = v_uid;

  INSERT INTO public.attendance_history
    (attendance_id, client_id, event_type, actor_id, actor_name, description, new_value, metadata, source)
  VALUES (
    _attendance_id, v_att.cliente_id, 'first_open', v_uid, v_corretor_nome,
    'Primeira abertura do atendimento pelo corretor atribuído.',
    jsonb_build_object('opened_at', now()),
    jsonb_build_object('response_time_seconds', v_seconds, 'assignment_id', v_assign.id),
    'system'
  );

  -- Notify admins (preserve current behavior of mark_attendance_opened)
  v_titulo := 'Atendimento iniciado por ' || COALESCE(v_corretor_nome, 'corretor');
  v_mensagem := 'Cliente: ' || COALESCE(v_att.cliente_nome, '-')
    || CASE WHEN v_att.telefone IS NOT NULL AND v_att.telefone <> '' THEN ' · Tel: ' || v_att.telefone ELSE '' END
    || CASE WHEN v_att.bairro_interesse IS NOT NULL AND v_att.bairro_interesse <> '' THEN ' · Bairro: ' || v_att.bairro_interesse ELSE '' END
    || CASE WHEN v_att.finalidade IS NOT NULL THEN ' · ' || v_att.finalidade ELSE '' END;
  v_link := '/atendimentos?id=' || _attendance_id::text;

  FOR v_admin IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'::public.app_role
  LOOP
    INSERT INTO public.notifications (user_id, tipo, titulo, mensagem, link, lida)
    VALUES (v_admin.user_id, 'atendimento_iniciado', v_titulo, v_mensagem, v_link, false);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'assignment_id', v_assign.id,
    'response_time_seconds', v_seconds
  );
END $$;

REVOKE ALL ON FUNCTION public.mark_attendance_first_opened(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_attendance_first_opened(UUID) TO authenticated;

-- 11. Query for management: pending/opened status per attendance (or list)
CREATE OR REPLACE FUNCTION public.get_attendance_assignment_status(_attendance_id UUID)
RETURNS TABLE(
  assignment_id UUID,
  broker_id UUID,
  broker_nome TEXT,
  assigned_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  response_time_seconds INTEGER,
  status public.attendance_assignment_status
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'secretaria'::public.app_role)) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT a.id, a.broker_id, p.nome, a.assigned_at, a.first_opened_at,
         a.response_time_seconds, a.status
  FROM public.attendance_assignments a
  LEFT JOIN public.profiles p ON p.id = a.broker_id
  WHERE a.attendance_id = _attendance_id
  ORDER BY a.assigned_at DESC;
END $$;

REVOKE ALL ON FUNCTION public.get_attendance_assignment_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_attendance_assignment_status(UUID) TO authenticated;

-- 12. Aggregate metrics for Corretores page
CREATE OR REPLACE FUNCTION public.get_corretores_response_metrics(
  _start TIMESTAMPTZ DEFAULT NULL,
  _end   TIMESTAMPTZ DEFAULT NULL,
  _imobiliaria TEXT DEFAULT NULL
) RETURNS TABLE(
  broker_id UUID,
  broker_nome TEXT,
  avg_seconds NUMERIC,
  median_seconds NUMERIC,
  fastest_seconds INTEGER,
  slowest_seconds INTEGER,
  completed_count BIGINT,
  pending_count BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.has_role(auth.uid(), 'secretaria'::public.app_role)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT a.*, p.nome AS broker_nome
    FROM public.attendance_assignments a
    LEFT JOIN public.profiles p ON p.id = a.broker_id
    WHERE (_start IS NULL OR a.assigned_at >= _start)
      AND (_end IS NULL OR a.assigned_at < _end)
      AND (_imobiliaria IS NULL OR a.imobiliaria = _imobiliaria)
  ),
  completed AS (
    SELECT broker_id, broker_nome, response_time_seconds
    FROM base
    WHERE status = 'opened'
      AND response_time_seconds IS NOT NULL
      AND first_opened_by = broker_id
  ),
  pending AS (
    SELECT broker_id, COUNT(*) AS c FROM base
    WHERE status = 'pending_open' GROUP BY broker_id
  )
  SELECT
    b.broker_id,
    MAX(b.broker_nome) AS broker_nome,
    AVG(c.response_time_seconds)::numeric AS avg_seconds,
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY c.response_time_seconds))::numeric AS median_seconds,
    MIN(c.response_time_seconds) AS fastest_seconds,
    MAX(c.response_time_seconds) AS slowest_seconds,
    COUNT(c.response_time_seconds) AS completed_count,
    COALESCE((SELECT c FROM pending WHERE pending.broker_id = b.broker_id), 0) AS pending_count
  FROM base b
  LEFT JOIN completed c ON c.broker_id = b.broker_id
  GROUP BY b.broker_id
  ORDER BY avg_seconds NULLS LAST;
END $$;

REVOKE ALL ON FUNCTION public.get_corretores_response_metrics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_corretores_response_metrics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

-- 13. Backfill existing attendances
INSERT INTO public.attendance_assignments
  (attendance_id, broker_id, assigned_by, assigned_at, first_opened_at, first_opened_by,
   response_time_seconds, status, imobiliaria)
SELECT
  a.id,
  public._try_uuid(a.corretor_id),
  a.created_by,
  a.created_at,
  a.opened_at,
  a.opened_by,
  CASE WHEN a.opened_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (a.opened_at - a.created_at))::int) ELSE NULL END,
  CASE WHEN a.opened_at IS NOT NULL THEN 'opened'::public.attendance_assignment_status
       ELSE 'pending_open'::public.attendance_assignment_status END,
  a.imobiliaria
FROM public.attendances a
WHERE public._try_uuid(a.corretor_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.attendance_assignments x WHERE x.attendance_id = a.id
  );
