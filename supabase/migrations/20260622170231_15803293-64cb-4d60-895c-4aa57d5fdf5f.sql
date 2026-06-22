-- Enums
DO $$ BEGIN
  CREATE TYPE public.agenda_tipo AS ENUM ('visita','fotos','video','assinatura','reuniao','retorno','vistoria','captacao','interno','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agenda_status AS ENUM ('agendado','confirmado','em_andamento','concluido','cancelado','reagendado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agenda_prioridade AS ENUM ('baixa','media','alta','urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agenda_imobiliaria AS ENUM ('cordial','morar','ambas');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agenda_participant_papel AS ENUM ('responsavel','participante','acompanhante');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.agenda_reminder_tipo AS ENUM ('interno','email','whatsapp','google_calendar');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Main table
CREATE TABLE IF NOT EXISTS public.agenda_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo public.agenda_tipo NOT NULL DEFAULT 'visita',
  status public.agenda_status NOT NULL DEFAULT 'agendado',
  prioridade public.agenda_prioridade NOT NULL DEFAULT 'media',
  imobiliaria public.agenda_imobiliaria NOT NULL DEFAULT 'cordial',
  titulo text NOT NULL,
  descricao text,
  observacoes text,
  inicio timestamptz NOT NULL,
  fim timestamptz,
  duracao_min integer,
  dia_inteiro boolean NOT NULL DEFAULT false,
  repeticao text NOT NULL DEFAULT 'nao',
  cliente_id text,
  cliente_nome text,
  atendimento_id text,
  imovel_id text,
  imovel_descricao text,
  local text,
  video_call_url text,
  responsavel_nome text,
  criado_por_nome text,
  google_calendar_sync_status text NOT NULL DEFAULT 'nao_sincronizado',
  concluido_em timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agenda_events_created_by_idx ON public.agenda_events(created_by);
CREATE INDEX IF NOT EXISTS agenda_events_owner_idx ON public.agenda_events(owner_user_id);
CREATE INDEX IF NOT EXISTS agenda_events_inicio_idx ON public.agenda_events(inicio);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_events TO authenticated;
GRANT ALL ON public.agenda_events TO service_role;

-- Children
CREATE TABLE IF NOT EXISTS public.agenda_event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  nome text NOT NULL,
  papel public.agenda_participant_papel NOT NULL DEFAULT 'participante',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agenda_participants_event_idx ON public.agenda_event_participants(event_id);
CREATE INDEX IF NOT EXISTS agenda_participants_user_idx ON public.agenda_event_participants(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_event_participants TO authenticated;
GRANT ALL ON public.agenda_event_participants TO service_role;

CREATE TABLE IF NOT EXISTS public.agenda_event_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  label text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agenda_checklist_event_idx ON public.agenda_event_checklist(event_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_event_checklist TO authenticated;
GRANT ALL ON public.agenda_event_checklist TO service_role;

CREATE TABLE IF NOT EXISTS public.agenda_event_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  tipo public.agenda_reminder_tipo NOT NULL DEFAULT 'interno',
  antecedencia_min integer NOT NULL DEFAULT 30,
  ativo boolean NOT NULL DEFAULT true,
  canal_futuro boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agenda_reminders_event_idx ON public.agenda_event_reminders(event_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agenda_event_reminders TO authenticated;
GRANT ALL ON public.agenda_event_reminders TO service_role;

-- Updated_at trigger (reuse public.touch_updated_at)
DROP TRIGGER IF EXISTS agenda_events_touch_updated_at ON public.agenda_events;
CREATE TRIGGER agenda_events_touch_updated_at BEFORE UPDATE ON public.agenda_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS agenda_checklist_touch_updated_at ON public.agenda_event_checklist;
CREATE TRIGGER agenda_checklist_touch_updated_at BEFORE UPDATE ON public.agenda_event_checklist
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Access helper (SECURITY DEFINER, avoids RLS recursion on children)
CREATE OR REPLACE FUNCTION public.agenda_can_access(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agenda_events e
    WHERE e.id = _event_id
      AND e.deleted_at IS NULL
      AND (
        e.created_by = auth.uid()
        OR e.owner_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR EXISTS (
          SELECT 1 FROM public.agenda_event_participants p
          WHERE p.event_id = e.id AND p.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.agenda_can_edit(_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.agenda_events e
    WHERE e.id = _event_id
      AND (
        e.created_by = auth.uid()
        OR e.owner_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  );
$$;

-- RLS
ALTER TABLE public.agenda_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_event_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_event_reminders ENABLE ROW LEVEL SECURITY;

-- agenda_events policies
CREATE POLICY "Agenda: ver compromissos visíveis"
ON public.agenda_events FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    created_by = auth.uid()
    OR owner_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.agenda_event_participants p
      WHERE p.event_id = agenda_events.id AND p.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Agenda: criar como autor"
ON public.agenda_events FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Agenda: editar próprio ou admin"
ON public.agenda_events FOR UPDATE TO authenticated
USING (
  created_by = auth.uid()
  OR owner_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
)
WITH CHECK (
  created_by = auth.uid()
  OR owner_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE POLICY "Agenda: excluir próprio ou admin"
ON public.agenda_events FOR DELETE TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Participants
CREATE POLICY "Participantes: ver via acesso ao evento"
ON public.agenda_event_participants FOR SELECT TO authenticated
USING (public.agenda_can_access(event_id));

CREATE POLICY "Participantes: gravar via edit do evento"
ON public.agenda_event_participants FOR INSERT TO authenticated
WITH CHECK (public.agenda_can_edit(event_id));

CREATE POLICY "Participantes: atualizar via edit"
ON public.agenda_event_participants FOR UPDATE TO authenticated
USING (public.agenda_can_edit(event_id))
WITH CHECK (public.agenda_can_edit(event_id));

CREATE POLICY "Participantes: deletar via edit"
ON public.agenda_event_participants FOR DELETE TO authenticated
USING (public.agenda_can_edit(event_id));

-- Checklist
CREATE POLICY "Checklist: ver via acesso"
ON public.agenda_event_checklist FOR SELECT TO authenticated
USING (public.agenda_can_access(event_id));
CREATE POLICY "Checklist: inserir via edit"
ON public.agenda_event_checklist FOR INSERT TO authenticated
WITH CHECK (public.agenda_can_edit(event_id));
CREATE POLICY "Checklist: atualizar via edit"
ON public.agenda_event_checklist FOR UPDATE TO authenticated
USING (public.agenda_can_edit(event_id))
WITH CHECK (public.agenda_can_edit(event_id));
CREATE POLICY "Checklist: deletar via edit"
ON public.agenda_event_checklist FOR DELETE TO authenticated
USING (public.agenda_can_edit(event_id));

-- Reminders
CREATE POLICY "Lembretes: ver via acesso"
ON public.agenda_event_reminders FOR SELECT TO authenticated
USING (public.agenda_can_access(event_id));
CREATE POLICY "Lembretes: inserir via edit"
ON public.agenda_event_reminders FOR INSERT TO authenticated
WITH CHECK (public.agenda_can_edit(event_id));
CREATE POLICY "Lembretes: atualizar via edit"
ON public.agenda_event_reminders FOR UPDATE TO authenticated
USING (public.agenda_can_edit(event_id))
WITH CHECK (public.agenda_can_edit(event_id));
CREATE POLICY "Lembretes: deletar via edit"
ON public.agenda_event_reminders FOR DELETE TO authenticated
USING (public.agenda_can_edit(event_id));