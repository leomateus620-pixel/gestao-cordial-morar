-- Notification experience: canonical payloads, paged inbox RPCs and strict timing isolation.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imobiliaria TEXT,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS assignment_id UUID REFERENCES public.attendance_assignments(id),
  ADD COLUMN IF NOT EXISTS actor_id UUID,
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_category_check,
  ADD CONSTRAINT notifications_category_check
    CHECK (category IN ('attendance', 'agenda', 'financial', 'system')),
  DROP CONSTRAINT IF EXISTS notifications_imobiliaria_check,
  ADD CONSTRAINT notifications_imobiliaria_check
    CHECK (imobiliaria IS NULL OR imobiliaria IN ('cordial', 'morar', 'ambas'));

CREATE INDEX IF NOT EXISTS notifications_inbox_cursor_idx
  ON public.notifications (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_category_idx
  ON public.notifications (user_id, category, created_at DESC)
  WHERE lida = false;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_key_uidx
  ON public.notifications (dedup_key)
  WHERE dedup_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS notifications_assignment_idx
  ON public.notifications (assignment_id)
  WHERE assignment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_dispatch_claims (
  claim_key TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'queued', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON public.email_dispatch_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.email_dispatch_claims TO service_role;
ALTER TABLE public.email_dispatch_claims ENABLE ROW LEVEL SECURITY;

UPDATE public.notifications
SET category = CASE tipo
  WHEN 'atendimento_atribuido' THEN 'attendance'
  WHEN 'atendimento_iniciado' THEN 'attendance'
  WHEN 'agenda_lembrete' THEN 'agenda'
  WHEN 'venda_vencimento' THEN 'financial'
  ELSE 'system'
END;

UPDATE public.notifications
SET entity_type = CASE
    WHEN tipo LIKE 'atendimento_%' THEN 'attendance'
    WHEN tipo = 'agenda_lembrete' THEN 'agenda_event'
    WHEN tipo = 'venda_vencimento' THEN 'sale'
    ELSE entity_type
  END,
  entity_id = COALESCE(
    entity_id,
    public._try_uuid(substring(link FROM '[?&]id=([0-9a-fA-F-]{36})'))
  ),
  read_at = CASE WHEN lida THEN COALESCE(read_at, created_at) ELSE NULL END;

UPDATE public.notifications n
SET imobiliaria = a.imobiliaria
FROM public.attendances a
WHERE n.entity_type = 'attendance'
  AND n.entity_id = a.id
  AND n.imobiliaria IS NULL;

UPDATE public.notifications n
SET imobiliaria = e.imobiliaria::TEXT
FROM public.agenda_events e
WHERE n.entity_type = 'agenda_event'
  AND n.entity_id = e.id
  AND n.imobiliaria IS NULL;

UPDATE public.notifications n
SET imobiliaria = s.imobiliaria
FROM public.real_estate_sales s
WHERE n.entity_type = 'sale'
  AND n.entity_id = s.id
  AND n.imobiliaria IS NULL;

UPDATE public.notifications n
SET assignment_id = (
  SELECT assignment.id
  FROM public.attendance_assignments assignment
  WHERE assignment.attendance_id = n.entity_id
    AND assignment.assigned_at <= n.created_at
  ORDER BY assignment.assigned_at DESC
  LIMIT 1
)
WHERE n.entity_type = 'attendance'
  AND n.entity_id IS NOT NULL
  AND n.assignment_id IS NULL;

CREATE TABLE IF NOT EXISTS public.user_agencies (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency TEXT NOT NULL CHECK (agency IN ('cordial', 'morar')),
  source TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, agency)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_agencies TO authenticated;
GRANT ALL ON public.user_agencies TO service_role;
ALTER TABLE public.user_agencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_agencies_select_self_or_admin ON public.user_agencies;
CREATE POLICY user_agencies_select_self_or_admin
  ON public.user_agencies FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS user_agencies_manage_admin ON public.user_agencies;
CREATE POLICY user_agencies_manage_admin
  ON public.user_agencies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND EXISTS (
       SELECT 1
       FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'notifications'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.notifications';
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS notification_broadcast_receive_own ON realtime.messages';
    EXECUTE $policy$
      CREATE POLICY notification_broadcast_receive_own
      ON realtime.messages
      FOR SELECT TO authenticated
      USING (
        extension = 'broadcast'
        AND (SELECT realtime.topic()) =
          'notifications:' || (SELECT auth.uid())::TEXT
      )
    $policy$;
  END IF;
END
$$;

INSERT INTO public.user_agencies (user_id, agency, source)
SELECT ur.user_id, agency.name, 'role_backfill'
FROM public.user_roles ur
JOIN auth.users auth_user ON auth_user.id = ur.user_id
CROSS JOIN (VALUES ('cordial'), ('morar')) AS agency(name)
WHERE ur.role IN ('admin'::public.app_role, 'secretaria'::public.app_role, 'financeiro'::public.app_role)
ON CONFLICT (user_id, agency) DO NOTHING;

INSERT INTO public.user_agencies (user_id, agency, source)
SELECT DISTINCT auth_user.id, agency.name, 'attendance_assignment'
FROM public.attendances a
JOIN auth.users auth_user ON auth_user.id = public._try_uuid(a.corretor_id)
CROSS JOIN (VALUES ('cordial'), ('morar')) AS agency(name)
WHERE a.imobiliaria = agency.name OR a.imobiliaria = 'ambas'
ON CONFLICT (user_id, agency) DO NOTHING;

INSERT INTO public.user_agencies (user_id, agency, source)
SELECT DISTINCT a.created_by, agency.name, 'attendance_creator'
FROM public.attendances a
JOIN auth.users auth_user ON auth_user.id = a.created_by
CROSS JOIN (VALUES ('cordial'), ('morar')) AS agency(name)
WHERE a.imobiliaria = agency.name OR a.imobiliaria = 'ambas'
ON CONFLICT (user_id, agency) DO NOTHING;

INSERT INTO public.user_agencies (user_id, agency, source)
SELECT DISTINCT e.owner_user_id, agency.name, 'agenda_owner'
FROM public.agenda_events e
JOIN auth.users auth_user ON auth_user.id = e.owner_user_id
CROSS JOIN (VALUES ('cordial'), ('morar')) AS agency(name)
WHERE e.imobiliaria::TEXT = agency.name OR e.imobiliaria::TEXT = 'ambas'
ON CONFLICT (user_id, agency) DO NOTHING;

INSERT INTO public.user_agencies (user_id, agency, source)
SELECT DISTINCT p.user_id, agency.name, 'agenda_participant'
FROM public.agenda_event_participants p
JOIN public.agenda_events e ON e.id = p.event_id
JOIN auth.users auth_user ON auth_user.id = p.user_id
CROSS JOIN (VALUES ('cordial'), ('morar')) AS agency(name)
WHERE e.imobiliaria::TEXT = agency.name OR e.imobiliaria::TEXT = 'ambas'
ON CONFLICT (user_id, agency) DO NOTHING;

INSERT INTO public.user_agencies (user_id, agency, source)
SELECT DISTINCT s.user_id, agency.name, 'sale_owner'
FROM public.real_estate_sales s
JOIN auth.users auth_user ON auth_user.id = s.user_id
CROSS JOIN (VALUES ('cordial'), ('morar')) AS agency(name)
WHERE s.imobiliaria = agency.name OR s.imobiliaria = 'ambas'
ON CONFLICT (user_id, agency) DO NOTHING;

DELETE FROM public.user_agencies
WHERE source IN ('compatibility_default', 'signup_default');
DROP TRIGGER IF EXISTS on_auth_user_created_notification_agencies ON auth.users;
DROP FUNCTION IF EXISTS public.provision_notification_agencies_for_new_user();

CREATE OR REPLACE FUNCTION public.has_notification_agency_access(_user_id UUID, _agency TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN _agency IS NULL THEN true
    WHEN _agency = 'ambas' THEN EXISTS (
      SELECT 1 FROM public.user_agencies ua WHERE ua.user_id = _user_id
    )
    ELSE EXISTS (
      SELECT 1
      FROM public.user_agencies ua
      WHERE ua.user_id = _user_id AND ua.agency = _agency
    )
  END
$$;

REVOKE ALL ON FUNCTION public.has_notification_agency_access(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_notification_agency_access(UUID, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.current_user_has_notification_agency_access(_agency TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_notification_agency_access(auth.uid(), _agency)
$$;

REVOKE ALL ON FUNCTION public.current_user_has_notification_agency_access(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_notification_agency_access(TEXT)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Users select own attendances or admin" ON public.attendances;
DROP POLICY IF EXISTS "Users select attendances visible" ON public.attendances;
DROP POLICY IF EXISTS "Users insert own attendances" ON public.attendances;
DROP POLICY IF EXISTS "Users update own attendances or admin" ON public.attendances;
DROP POLICY IF EXISTS "Users update attendances editable" ON public.attendances;
DROP POLICY IF EXISTS "Users delete own attendances or admin" ON public.attendances;

CREATE POLICY "Users select attendances visible"
  ON public.attendances FOR SELECT TO authenticated
  USING (
    public.current_user_has_notification_agency_access(imobiliaria)
    AND (
      created_by = auth.uid()
      OR corretor_id = auth.uid()::TEXT
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    )
  );

CREATE POLICY "Users insert own attendances"
  ON public.attendances FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.current_user_has_notification_agency_access(imobiliaria)
  );

CREATE POLICY "Users update attendances editable"
  ON public.attendances FOR UPDATE TO authenticated
  USING (
    public.current_user_has_notification_agency_access(imobiliaria)
    AND (
      created_by = auth.uid()
      OR corretor_id = auth.uid()::TEXT
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    )
  )
  WITH CHECK (
    public.current_user_has_notification_agency_access(imobiliaria)
    AND (
      created_by = auth.uid()
      OR corretor_id = auth.uid()::TEXT
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    )
  );

CREATE POLICY "Users delete own attendances or admin"
  ON public.attendances FOR DELETE TO authenticated
  USING (
    public.current_user_has_notification_agency_access(imobiliaria)
    AND (
      created_by = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.attendance_can_access(_attendance_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.attendances attendance
    WHERE attendance.id = _attendance_id
      AND public.has_notification_agency_access(auth.uid(), attendance.imobiliaria)
      AND (
        attendance.created_by = auth.uid()
        OR attendance.corretor_id = auth.uid()::TEXT
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.agenda_can_access(_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agenda_events event
    WHERE event.id = _event_id
      AND event.deleted_at IS NULL
      AND public.has_notification_agency_access(auth.uid(), event.imobiliaria::TEXT)
      AND (
        event.created_by = auth.uid()
        OR event.owner_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
        OR EXISTS (
          SELECT 1
          FROM public.agenda_event_participants participant
          WHERE participant.event_id = event.id
            AND participant.user_id = auth.uid()
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.agenda_can_edit(_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agenda_events event
    WHERE event.id = _event_id
      AND public.has_notification_agency_access(auth.uid(), event.imobiliaria::TEXT)
      AND (
        event.created_by = auth.uid()
        OR event.owner_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
      )
  )
$$;

DROP POLICY IF EXISTS "Agenda: ver compromissos visíveis" ON public.agenda_events;
DROP POLICY IF EXISTS "Agenda: criar como autor" ON public.agenda_events;
DROP POLICY IF EXISTS "Agenda: editar próprio ou admin" ON public.agenda_events;
DROP POLICY IF EXISTS "Agenda: excluir próprio ou admin" ON public.agenda_events;

CREATE POLICY "Agenda: ver compromissos visíveis"
  ON public.agenda_events FOR SELECT TO authenticated
  USING (public.agenda_can_access(id));

CREATE POLICY "Agenda: criar como autor"
  ON public.agenda_events FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.current_user_has_notification_agency_access(imobiliaria::TEXT)
  );

CREATE POLICY "Agenda: editar próprio ou admin"
  ON public.agenda_events FOR UPDATE TO authenticated
  USING (public.agenda_can_edit(id))
  WITH CHECK (
    public.current_user_has_notification_agency_access(imobiliaria::TEXT)
    AND (
      created_by = auth.uid()
      OR owner_user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    )
  );

CREATE POLICY "Agenda: excluir próprio ou admin"
  ON public.agenda_events FOR DELETE TO authenticated
  USING (public.agenda_can_edit(id));

DROP POLICY IF EXISTS "Users view own sales or admins view all" ON public.real_estate_sales;
DROP POLICY IF EXISTS "Users insert own sales" ON public.real_estate_sales;
DROP POLICY IF EXISTS "Users update own sales or admins update all" ON public.real_estate_sales;
DROP POLICY IF EXISTS "Users delete own sales or admins delete all" ON public.real_estate_sales;

CREATE POLICY "Users view own sales or admins view all"
  ON public.real_estate_sales FOR SELECT TO authenticated
  USING (
    public.current_user_has_notification_agency_access(imobiliaria)
    AND (
      auth.uid() = user_id
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE POLICY "Users insert own sales"
  ON public.real_estate_sales FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.current_user_has_notification_agency_access(imobiliaria)
  );

CREATE POLICY "Users update own sales or admins update all"
  ON public.real_estate_sales FOR UPDATE TO authenticated
  USING (
    public.current_user_has_notification_agency_access(imobiliaria)
    AND (
      auth.uid() = user_id
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
  WITH CHECK (
    public.current_user_has_notification_agency_access(imobiliaria)
    AND (
      auth.uid() = user_id
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE POLICY "Users delete own sales or admins delete all"
  ON public.real_estate_sales FOR DELETE TO authenticated
  USING (
    public.current_user_has_notification_agency_access(imobiliaria)
    AND (
      auth.uid() = user_id
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.notifications_normalize_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link_id UUID;
  v_canonical_agency TEXT;
  v_resolved_assignment UUID;
BEGIN
  NEW.category := CASE NEW.tipo
    WHEN 'atendimento_atribuido' THEN 'attendance'
    WHEN 'atendimento_iniciado' THEN 'attendance'
    WHEN 'agenda_lembrete' THEN 'agenda'
    WHEN 'venda_vencimento' THEN 'financial'
    ELSE COALESCE(NEW.category, 'system')
  END;

  v_link_id := public._try_uuid(substring(NEW.link FROM '[?&]id=([0-9a-fA-F-]{36})'));
  NEW.entity_id := COALESCE(NEW.entity_id, v_link_id);
  NEW.entity_type := COALESCE(
    NEW.entity_type,
    CASE
      WHEN NEW.tipo LIKE 'atendimento_%' THEN 'attendance'
      WHEN NEW.tipo = 'agenda_lembrete' THEN 'agenda_event'
      WHEN NEW.tipo = 'venda_vencimento' THEN 'sale'
      ELSE NULL
    END
  );

  IF NEW.entity_type IN ('attendance', 'agenda_event', 'sale') AND NEW.entity_id IS NULL THEN
    RAISE EXCEPTION 'linked notification requires a valid entity id'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.entity_type = 'attendance' THEN
    SELECT attendance.imobiliaria INTO v_canonical_agency
    FROM public.attendances attendance
    WHERE attendance.id = NEW.entity_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'notification attendance is unavailable' USING ERRCODE = '23503';
    END IF;

    SELECT assignment.id INTO v_resolved_assignment
    FROM public.attendance_assignments assignment
    WHERE assignment.attendance_id = NEW.entity_id
      AND (NEW.assignment_id IS NULL OR assignment.id = NEW.assignment_id)
    ORDER BY assignment.assigned_at DESC
    LIMIT 1;
    IF v_resolved_assignment IS NULL THEN
      RAISE EXCEPTION 'notification assignment is unavailable for attendance'
        USING ERRCODE = '23503';
    END IF;
    NEW.assignment_id := COALESCE(NEW.assignment_id, v_resolved_assignment);
  ELSIF NEW.entity_type = 'agenda_event' THEN
    SELECT agenda.imobiliaria::TEXT INTO v_canonical_agency
    FROM public.agenda_events agenda
    WHERE agenda.id = NEW.entity_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'notification agenda event is unavailable' USING ERRCODE = '23503';
    END IF;
  ELSIF NEW.entity_type = 'sale' THEN
    SELECT sale.imobiliaria INTO v_canonical_agency
    FROM public.real_estate_sales sale
    WHERE sale.id = NEW.entity_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'notification sale is unavailable' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF v_canonical_agency IS NOT NULL THEN
    IF NEW.imobiliaria IS NOT NULL AND NEW.imobiliaria IS DISTINCT FROM v_canonical_agency THEN
      RAISE EXCEPTION 'notification agency differs from canonical entity agency'
        USING ERRCODE = '23514';
    END IF;
    NEW.imobiliaria := v_canonical_agency;
  END IF;

  IF NOT public.has_notification_agency_access(NEW.user_id, NEW.imobiliaria) THEN
    RAISE EXCEPTION 'notification recipient is outside the requested agency scope'
      USING ERRCODE = '42501';
  END IF;

  NEW.actor_id := COALESCE(NEW.actor_id, auth.uid());
  NEW.read_at := CASE WHEN NEW.lida THEN COALESCE(NEW.read_at, now()) ELSE NULL END;
  IF COALESCE(NEW.assignment_id, NEW.entity_id) IS NOT NULL THEN
    NEW.dedup_key := COALESCE(
      NEW.dedup_key,
      concat_ws(
        ':',
        NEW.user_id::TEXT,
        NEW.tipo,
        COALESCE(NEW.assignment_id, NEW.entity_id)::TEXT
      )
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS notifications_normalize_insert_trg ON public.notifications;
CREATE TRIGGER notifications_normalize_insert_trg
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_normalize_insert();

CREATE OR REPLACE FUNCTION public.publish_notification_realtime_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NOT NULL THEN
    BEGIN
      EXECUTE 'SELECT realtime.send($1, $2, $3, $4)'
      USING
        jsonb_build_object('notification_id', NEW.id),
        'notification.created',
        'notifications:' || NEW.user_id::TEXT,
        true;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'notification broadcast failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS notifications_publish_realtime_event_trg ON public.notifications;
CREATE TRIGGER notifications_publish_realtime_event_trg
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.publish_notification_realtime_event();

CREATE OR REPLACE FUNCTION public.enforce_attendance_assignment_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target UUID;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.corretor_id IS NOT DISTINCT FROM OLD.corretor_id
     AND NEW.imobiliaria IS NOT DISTINCT FROM OLD.imobiliaria THEN
    RETURN NEW;
  END IF;
  v_target := public._try_uuid(NEW.corretor_id);
  IF TG_OP = 'INSERT' AND v_target IS NULL THEN RETURN NEW; END IF;

  IF auth.uid() IS NOT NULL AND NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'only management can assign an attendance'
      USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL
     AND NOT public.has_notification_agency_access(auth.uid(), NEW.imobiliaria) THEN
    RAISE EXCEPTION 'assignment actor is outside the attendance agency scope'
      USING ERRCODE = '42501';
  END IF;
  IF v_target IS NULL THEN RETURN NEW; END IF;
  IF NOT (
    public.has_role(v_target, 'corretor'::public.app_role)
    OR public.has_role(v_target, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'attendance target is not an active broker'
      USING ERRCODE = '23514';
  END IF;
  IF NOT public.has_notification_agency_access(v_target, NEW.imobiliaria) THEN
    RAISE EXCEPTION 'broker is outside the attendance agency scope'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.attendances_sync_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_broker UUID := public._try_uuid(NEW.corretor_id);
  v_old_broker UUID;
  v_actor UUID := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_new_broker IS NOT NULL THEN
      INSERT INTO public.attendance_assignments
        (attendance_id, broker_id, assigned_by, assigned_at, imobiliaria)
      VALUES (
        NEW.id,
        v_new_broker,
        COALESCE(v_actor, NEW.created_by),
        now(),
        NEW.imobiliaria
      );

      INSERT INTO public.attendance_history
        (attendance_id, client_id, event_type, actor_id, description, new_value, source)
      VALUES (
        NEW.id,
        NEW.cliente_id,
        'assignment_created',
        v_actor,
        'Atendimento atribuído ao corretor.',
        jsonb_build_object(
          'broker_id', v_new_broker::TEXT,
          'imobiliaria', NEW.imobiliaria
        ),
        'trigger'
      );
    END IF;
    RETURN NEW;
  END IF;

  v_old_broker := public._try_uuid(OLD.corretor_id);
  IF v_new_broker IS NOT DISTINCT FROM v_old_broker
     AND NEW.imobiliaria IS NOT DISTINCT FROM OLD.imobiliaria THEN
    RETURN NEW;
  END IF;

  UPDATE public.attendance_assignments
  SET status = CASE
        WHEN v_new_broker IS NULL
          THEN 'cancelled'::public.attendance_assignment_status
        ELSE 'superseded'::public.attendance_assignment_status
      END,
      superseded_at = CASE WHEN v_new_broker IS NOT NULL THEN now() ELSE NULL END,
      cancelled_at = CASE WHEN v_new_broker IS NULL THEN now() ELSE NULL END
  WHERE attendance_id = NEW.id
    AND status = 'pending_open';

  IF v_new_broker IS NOT NULL THEN
    INSERT INTO public.attendance_assignments
      (attendance_id, broker_id, assigned_by, assigned_at, imobiliaria)
    VALUES (
      NEW.id,
      v_new_broker,
      COALESCE(v_actor, NEW.created_by),
      now(),
      NEW.imobiliaria
    );

    INSERT INTO public.attendance_history
      (attendance_id, client_id, event_type, actor_id, description,
       previous_value, new_value, source)
    VALUES (
      NEW.id,
      NEW.cliente_id,
      'assignment_created',
      v_actor,
      'Nova atribuição de corretor iniciada.',
      jsonb_build_object(
        'broker_id', v_old_broker::TEXT,
        'imobiliaria', OLD.imobiliaria
      ),
      jsonb_build_object(
        'broker_id', v_new_broker::TEXT,
        'imobiliaria', NEW.imobiliaria
      ),
      'trigger'
    );
  ELSE
    INSERT INTO public.attendance_history
      (attendance_id, client_id, event_type, actor_id, description, previous_value, source)
    VALUES (
      NEW.id,
      NEW.cliente_id,
      'assignment_cancelled',
      v_actor,
      'Atribuição de corretor removida.',
      jsonb_build_object(
        'broker_id', v_old_broker::TEXT,
        'imobiliaria', OLD.imobiliaria
      ),
      'trigger'
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS attendance_assignment_agency_membership_trg ON public.attendance_assignments;
DROP TRIGGER IF EXISTS attendances_enforce_assignment_scope_trg ON public.attendances;
CREATE TRIGGER attendances_enforce_assignment_scope_trg
  BEFORE INSERT OR UPDATE OF corretor_id, imobiliaria ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_attendance_assignment_scope();

DROP TRIGGER IF EXISTS attendances_sync_assignments_trg ON public.attendances;
CREATE TRIGGER attendances_sync_assignments_trg
  AFTER INSERT OR UPDATE OF corretor_id, imobiliaria ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.attendances_sync_assignments();

REVOKE ALL ON FUNCTION public.notifications_normalize_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_notification_realtime_event()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_attendance_assignment_scope()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attendances_sync_assignments()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_atendimento_corretor()
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS assign_select_management ON public.attendance_assignments;
CREATE POLICY assign_select_management
  ON public.attendance_assignments FOR SELECT TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
    )
    AND public.current_user_has_notification_agency_access(imobiliaria)
  );

DROP FUNCTION IF EXISTS public.list_assignable_brokers();
CREATE OR REPLACE FUNCTION public.list_assignable_brokers(_agency TEXT DEFAULT NULL)
RETURNS TABLE(id UUID, nome TEXT, agencies TEXT[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  ) THEN
    RETURN;
  END IF;
  IF _agency IS NOT NULL AND _agency NOT IN ('cordial', 'morar', 'ambas') THEN
    RAISE EXCEPTION 'invalid agency' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.nome,
    array_agg(DISTINCT target_agency.agency ORDER BY target_agency.agency) AS agencies
  FROM public.profiles p
  JOIN public.user_agencies target_agency ON target_agency.user_id = p.id
  JOIN public.user_agencies caller_agency
    ON caller_agency.agency = target_agency.agency
   AND caller_agency.user_id = auth.uid()
  WHERE (
      public.has_role(p.id, 'corretor'::public.app_role)
      OR public.has_role(p.id, 'admin'::public.app_role)
    )
    AND (_agency IS NULL OR _agency = 'ambas' OR target_agency.agency = _agency)
  GROUP BY p.id, p.nome
  ORDER BY p.nome;
END
$$;

REVOKE ALL ON FUNCTION public.list_assignable_brokers(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_assignable_brokers(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.notify_atendimento_corretor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target UUID;
  v_message TEXT;
  v_budget TEXT;
  v_assignment_id UUID;
BEGIN
  v_target := public._try_uuid(NEW.corretor_id);
  IF v_target IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND v_target IS NOT DISTINCT FROM NEW.created_by THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND (
    (
      NEW.corretor_id IS NOT DISTINCT FROM OLD.corretor_id
      AND NEW.imobiliaria IS NOT DISTINCT FROM OLD.imobiliaria
    )
    OR v_target IS NOT DISTINCT FROM NEW.created_by
  ) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_target) THEN RETURN NEW; END IF;

  SELECT assignment.id INTO v_assignment_id
  FROM public.attendance_assignments assignment
  WHERE assignment.attendance_id = NEW.id
    AND assignment.broker_id = v_target
  ORDER BY assignment.assigned_at DESC
  LIMIT 1;
  IF v_assignment_id IS NULL THEN
    RAISE EXCEPTION 'attendance assignment was not created before notification'
      USING ERRCODE = '23503';
  END IF;

  v_budget := CASE
    WHEN NEW.orcamento_min IS NOT NULL AND NEW.orcamento_max IS NOT NULL THEN
      'Orçamento: R$ ' || to_char(NEW.orcamento_min, 'FM999G999G990D00')
        || ' – R$ ' || to_char(NEW.orcamento_max, 'FM999G999G990D00')
    WHEN NEW.orcamento_max IS NOT NULL THEN
      'Orçamento até R$ ' || to_char(NEW.orcamento_max, 'FM999G999G990D00')
    WHEN NEW.orcamento_min IS NOT NULL THEN
      'Orçamento a partir de R$ ' || to_char(NEW.orcamento_min, 'FM999G999G990D00')
    ELSE NULL
  END;
  v_message := concat_ws(
    ' • ',
    NULLIF(trim(NEW.cliente_nome), ''),
    NULLIF(trim(NEW.telefone), ''),
    CASE
      WHEN NEW.finalidade IS NOT NULL AND NEW.tipo_imovel IS NOT NULL
        THEN 'Interesse: ' || NEW.finalidade || ' / ' || NEW.tipo_imovel
      WHEN NEW.finalidade IS NOT NULL THEN 'Interesse: ' || NEW.finalidade
      ELSE NULL
    END,
    NULLIF(trim(NEW.bairro_interesse), ''),
    v_budget,
    CASE WHEN NEW.proximo_passo IS NOT NULL
      THEN 'Próximo passo: ' || NEW.proximo_passo ELSE NULL END
  );

  INSERT INTO public.notifications
    (user_id, tipo, category, titulo, mensagem, link, imobiliaria,
     entity_type, entity_id, assignment_id, actor_id)
  VALUES (
    v_target,
    'atendimento_atribuido',
    'attendance',
    'Novo atendimento atribuído a você',
    NULLIF(v_message, ''),
    '/atendimentos?id=' || NEW.id::TEXT,
    NEW.imobiliaria,
    'attendance',
    NEW.id,
    v_assignment_id,
    auth.uid()
  )
  ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_notify_atendimento_corretor ON public.attendances;
CREATE TRIGGER trg_notify_atendimento_corretor
  AFTER INSERT OR UPDATE OF corretor_id, imobiliaria ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.notify_atendimento_corretor();

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS notifications_select_scoped ON public.notifications;
CREATE POLICY notifications_select_scoped
  ON public.notifications FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.current_user_has_notification_agency_access(imobiliaria)
  );

REVOKE SELECT, UPDATE, DELETE ON public.notifications FROM authenticated;
ALTER TABLE public.notifications REPLICA IDENTITY DEFAULT;

CREATE OR REPLACE FUNCTION public.list_my_notifications(
  _limit INTEGER DEFAULT 24,
  _before_created_at TIMESTAMPTZ DEFAULT NULL,
  _before_id UUID DEFAULT NULL,
  _category TEXT DEFAULT NULL
) RETURNS TABLE(
  id UUID,
  tipo TEXT,
  category TEXT,
  titulo TEXT,
  mensagem TEXT,
  link TEXT,
  lida BOOLEAN,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  imobiliaria TEXT,
  entity_type TEXT,
  entity_id UUID,
  actor_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    n.id, n.tipo, n.category, n.titulo, n.mensagem, n.link, n.lida, n.read_at,
    n.created_at, n.imobiliaria, n.entity_type, n.entity_id, n.actor_id
  FROM public.notifications n
  WHERE n.user_id = auth.uid()
    AND public.has_notification_agency_access(auth.uid(), n.imobiliaria)
    AND (_category IS NULL OR n.category = _category)
    AND (
      _before_created_at IS NULL
      OR (n.created_at, n.id) < (_before_created_at, _before_id)
    )
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 24), 1), 41)
$$;

CREATE OR REPLACE FUNCTION public.get_my_notification_summary()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH visible AS (
    SELECT n.category, n.lida, n.created_at
    FROM public.notifications n
    WHERE n.user_id = auth.uid()
      AND public.has_notification_agency_access(auth.uid(), n.imobiliaria)
  )
  SELECT jsonb_build_object(
    'unread_total', (SELECT count(*) FROM visible WHERE NOT lida),
    'today_total', (
      SELECT count(*) FROM visible
      WHERE (created_at AT TIME ZONE 'America/Sao_Paulo')::DATE =
            (now() AT TIME ZONE 'America/Sao_Paulo')::DATE
    ),
    'by_category', COALESCE(
      (
        SELECT jsonb_agg(jsonb_build_object('category', grouped.category, 'unread', grouped.unread))
        FROM (
          SELECT category, count(*) AS unread
          FROM visible
          WHERE NOT lida
          GROUP BY category
          ORDER BY category
        ) grouped
      ),
      '[]'::JSONB
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.notifications%ROWTYPE;
BEGIN
  UPDATE public.notifications n
  SET lida = true, read_at = COALESCE(n.read_at, now())
  WHERE n.id = _id
    AND n.user_id = auth.uid()
    AND public.has_notification_agency_access(auth.uid(), n.imobiliaria)
  RETURNING n.* INTO v_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification unavailable' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('id', v_row.id, 'lida', v_row.lida, 'read_at', v_row.read_at);
END
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.notifications n
  SET lida = true, read_at = COALESCE(n.read_at, now())
  WHERE n.user_id = auth.uid()
    AND NOT n.lida
    AND public.has_notification_agency_access(auth.uid(), n.imobiliaria);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END
$$;

CREATE OR REPLACE FUNCTION public.get_notification_attendance_statuses(
  _notification_ids UUID[]
) RETURNS TABLE(
  notification_id UUID,
  broker_nome TEXT,
  assigned_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  response_time_seconds INTEGER,
  status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'management role required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT n.id, p.nome, assignment.assigned_at, assignment.first_opened_at,
         assignment.response_time_seconds, assignment.status::TEXT
  FROM public.notifications n
  JOIN public.attendance_assignments assignment
    ON assignment.id = n.assignment_id
   AND assignment.attendance_id = n.entity_id
   AND assignment.imobiliaria IS NOT DISTINCT FROM n.imobiliaria
  LEFT JOIN public.profiles p ON p.id = assignment.broker_id
  WHERE n.id = ANY(COALESCE(_notification_ids, ARRAY[]::UUID[]))
    AND n.user_id = auth.uid()
    AND n.entity_type = 'attendance'
    AND public.has_notification_agency_access(auth.uid(), n.imobiliaria);
END
$$;

CREATE OR REPLACE FUNCTION public.get_notification_management_summary(
  _start TIMESTAMPTZ,
  _end TIMESTAMPTZ,
  _imobiliaria TEXT DEFAULT NULL
) RETURNS TABLE(
  assigned_count BIGINT,
  pending_open_count BIGINT,
  opened_count BIGINT,
  avg_first_open_seconds NUMERIC,
  median_first_open_seconds NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'management role required' USING ERRCODE = '42501';
  END IF;
  IF _start IS NULL OR _end IS NULL OR _end <= _start THEN
    RAISE EXCEPTION 'invalid management summary window' USING ERRCODE = '22023';
  END IF;
  IF _imobiliaria IS NOT NULL AND _imobiliaria NOT IN ('cordial', 'morar') THEN
    RAISE EXCEPTION 'invalid agency' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT
    count(*) AS assigned_count,
    count(*) FILTER (WHERE a.status = 'pending_open') AS pending_open_count,
    count(*) FILTER (
      WHERE a.status = 'opened' AND a.first_opened_by = a.broker_id
    ) AS opened_count,
    avg(a.response_time_seconds) FILTER (
      WHERE a.status = 'opened' AND a.first_opened_by = a.broker_id
    )::NUMERIC AS avg_first_open_seconds,
    (
      percentile_cont(0.5) WITHIN GROUP (ORDER BY a.response_time_seconds) FILTER (
        WHERE a.status = 'opened'
          AND a.first_opened_by = a.broker_id
          AND a.response_time_seconds IS NOT NULL
      )
    )::NUMERIC AS median_first_open_seconds
  FROM public.attendance_assignments a
  WHERE a.assigned_at >= _start
    AND a.assigned_at < _end
    AND (_imobiliaria IS NULL OR a.imobiliaria = _imobiliaria)
    AND public.has_notification_agency_access(auth.uid(), a.imobiliaria);
END
$$;

REVOKE ALL ON FUNCTION public.list_my_notifications(INTEGER, TIMESTAMPTZ, UUID, TEXT)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_notification_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_notification_attendance_statuses(UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_notification_management_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_notifications(INTEGER, TIMESTAMPTZ, UUID, TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_notification_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_notification_attendance_statuses(UUID[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_notification_management_summary(TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_attendance_first_opened(_attendance_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_assign public.attendance_assignments%ROWTYPE;
  v_att public.attendances%ROWTYPE;
  v_corretor_nome TEXT;
  v_seconds INTEGER;
  v_admin RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_assign
  FROM public.attendance_assignments
  WHERE attendance_id = _attendance_id AND status = 'pending_open'
  FOR UPDATE;

  IF NOT FOUND OR v_assign.broker_id <> v_uid THEN
    RETURN jsonb_build_object('ok', true, 'noop', true);
  END IF;

  v_seconds := GREATEST(0, extract(epoch FROM (now() - v_assign.assigned_at))::INTEGER);
  UPDATE public.attendance_assignments
  SET status = 'opened',
      first_opened_at = now(),
      first_opened_by = v_uid,
      response_time_seconds = v_seconds
  WHERE id = v_assign.id;

  UPDATE public.attendances
  SET opened_at = now(), opened_by = v_uid
  WHERE id = _attendance_id AND opened_at IS NULL;

  SELECT * INTO v_att FROM public.attendances WHERE id = _attendance_id;
  SELECT COALESCE(p.nome, v_att.corretor_nome, 'Corretor') INTO v_corretor_nome
  FROM public.profiles p WHERE p.id = v_uid;

  INSERT INTO public.attendance_history
    (attendance_id, client_id, event_type, actor_id, actor_name, description, new_value, metadata, source)
  VALUES (
    _attendance_id,
    v_att.cliente_id,
    'first_open',
    v_uid,
    v_corretor_nome,
    'Primeira abertura do atendimento pelo corretor atribuído.',
    jsonb_build_object('status', 'opened'),
    '{}'::JSONB,
    'system'
  );

  FOR v_admin IN
    SELECT user_id
    FROM public.user_roles
    WHERE role = 'admin'::public.app_role
      AND public.has_notification_agency_access(user_id, v_att.imobiliaria)
  LOOP
    BEGIN
      INSERT INTO public.notifications
        (user_id, tipo, titulo, mensagem, link, lida, category, imobiliaria,
         entity_type, entity_id, assignment_id, actor_id)
      VALUES (
        v_admin.user_id,
        'atendimento_iniciado',
        'Atendimento iniciado por ' || COALESCE(v_corretor_nome, 'corretor'),
        'Cliente: ' || COALESCE(v_att.cliente_nome, '-')
          || CASE WHEN v_att.telefone IS NOT NULL AND v_att.telefone <> ''
               THEN ' · Tel: ' || v_att.telefone ELSE '' END
          || CASE WHEN v_att.bairro_interesse IS NOT NULL AND v_att.bairro_interesse <> ''
               THEN ' · Bairro: ' || v_att.bairro_interesse ELSE '' END
          || CASE WHEN v_att.finalidade IS NOT NULL THEN ' · ' || v_att.finalidade ELSE '' END,
        '/atendimentos?id=' || _attendance_id::TEXT,
        false,
        'attendance',
        v_att.imobiliaria,
        'attendance',
        _attendance_id,
        v_assign.id,
        v_uid
      )
      ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'first-open notification failed for recipient %: %',
        v_admin.user_id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'noop', false);
END
$$;

REVOKE ALL ON FUNCTION public.mark_attendance_first_opened(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_attendance_first_opened(UUID) TO authenticated;
DROP FUNCTION IF EXISTS public.mark_attendance_opened(UUID);
DROP FUNCTION IF EXISTS public.get_attendance_assignment_status(UUID);

UPDATE public.attendance_history
SET new_value = COALESCE(new_value, '{}'::JSONB) - 'opened_at',
    metadata = COALESCE(metadata, '{}'::JSONB) - 'response_time_seconds'
WHERE event_type = 'first_open';

REVOKE SELECT ON public.attendance_assignments FROM authenticated;
REVOKE SELECT, INSERT, UPDATE ON public.attendances FROM authenticated;
DO $$
DECLARE
  v_read_insert_columns TEXT;
  v_update_columns TEXT;
BEGIN
  SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
  INTO v_read_insert_columns
  FROM pg_attribute attribute
  WHERE attribute.attrelid = 'public.attendances'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND attribute.attname NOT IN ('opened_at', 'opened_by');
  SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
  INTO v_update_columns
  FROM pg_attribute attribute
  WHERE attribute.attrelid = 'public.attendances'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped
    AND attribute.attname NOT IN (
      'id', 'created_by', 'created_at', 'updated_at', 'opened_at', 'opened_by'
    );
  EXECUTE format(
    'GRANT SELECT (%s) ON public.attendances TO authenticated',
    v_read_insert_columns
  );
  EXECUTE format(
    'GRANT INSERT (%s) ON public.attendances TO authenticated',
    v_read_insert_columns
  );
  EXECUTE format(
    'GRANT UPDATE (%s) ON public.attendances TO authenticated',
    v_update_columns
  );
END
$$;

CREATE OR REPLACE FUNCTION public.get_corretores_response_metrics(
  _start TIMESTAMPTZ DEFAULT NULL,
  _end TIMESTAMPTZ DEFAULT NULL,
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
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.broker_id,
    max(p.nome) AS broker_nome,
    avg(a.response_time_seconds) FILTER (
      WHERE a.status = 'opened' AND a.first_opened_by = a.broker_id
    )::NUMERIC AS avg_seconds,
    (
      percentile_cont(0.5) WITHIN GROUP (ORDER BY a.response_time_seconds) FILTER (
        WHERE a.status = 'opened'
          AND a.first_opened_by = a.broker_id
          AND a.response_time_seconds IS NOT NULL
      )
    )::NUMERIC AS median_seconds,
    min(a.response_time_seconds) FILTER (
      WHERE a.status = 'opened' AND a.first_opened_by = a.broker_id
    ) AS fastest_seconds,
    max(a.response_time_seconds) FILTER (
      WHERE a.status = 'opened' AND a.first_opened_by = a.broker_id
    ) AS slowest_seconds,
    count(*) FILTER (
      WHERE a.status = 'opened'
        AND a.first_opened_by = a.broker_id
        AND a.response_time_seconds IS NOT NULL
    ) AS completed_count,
    count(*) FILTER (WHERE a.status = 'pending_open') AS pending_count
  FROM public.attendance_assignments a
  LEFT JOIN public.profiles p ON p.id = a.broker_id
  WHERE (_start IS NULL OR a.assigned_at >= _start)
    AND (_end IS NULL OR a.assigned_at < _end)
    AND (_imobiliaria IS NULL OR a.imobiliaria = _imobiliaria)
    AND public.has_notification_agency_access(auth.uid(), a.imobiliaria)
  GROUP BY a.broker_id
  ORDER BY avg_seconds NULLS LAST;
END
$$;

REVOKE ALL ON FUNCTION public.get_corretores_response_metrics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_corretores_response_metrics(TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO authenticated, service_role;