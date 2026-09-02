-- 1) Agenda de fotos é compartilhada: toda a equipe operacional enxerga
--    sessões de produção de material (fotos/vídeo) da sua imobiliária.
--    Demais categorias seguem privadas como antes.
DROP POLICY IF EXISTS "Agenda: ver compromissos visíveis" ON public.agenda_events;
CREATE POLICY "Agenda: ver compromissos visíveis"
ON public.agenda_events
FOR SELECT
TO authenticated
USING (
  current_user_has_notification_agency_access(imobiliaria::text)
  AND (
    created_by = auth.uid()
    OR owner_user_id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'secretaria'::app_role)
    OR agenda_is_participant(id)
    -- produção de material: visível para quem pode acompanhar/ajudar
    OR (
      tipo IN ('fotos'::agenda_tipo, 'video'::agenda_tipo)
      AND has_role(auth.uid(), 'corretor'::app_role)
    )
  )
);

-- 2) Sinalização interna: um aviso por agendamento novo ou reagendado.
CREATE OR REPLACE FUNCTION public.agenda_notify_photo_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _quando text;
  _titulo text;
  _mensagem text;
  _imovel text;
  _autor text;
  _dedup_base text;
  _r record;
BEGIN
  IF NEW.tipo NOT IN ('fotos'::agenda_tipo, 'video'::agenda_tipo) THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.status = 'cancelado'::agenda_status THEN
    RETURN NEW;
  END IF;
  -- Só avisa em criação ou quando a data/hora muda (evita spam em edições).
  IF TG_OP = 'UPDATE' AND NEW.inicio IS NOT DISTINCT FROM OLD.inicio THEN
    RETURN NEW;
  END IF;

  _quando := to_char(NEW.inicio AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI');
  _imovel := coalesce(NEW.imovel_nome, NEW.imovel_endereco, NEW.local, NEW.titulo);
  _autor := coalesce(NEW.responsavel_nome, NEW.criado_por_nome, 'equipe');
  _titulo := CASE WHEN TG_OP = 'INSERT'
    THEN 'Produção de material agendada'
    ELSE 'Produção de material remarcada' END;
  _mensagem := _imovel || ' · ' || _quando || ' · por ' || _autor;
  _dedup_base := 'agenda_fotos:' || NEW.id::text || ':' || extract(epoch from NEW.inicio)::bigint::text;

  FOR _r IN
    SELECT DISTINCT ur.user_id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::app_role, 'secretaria'::app_role, 'corretor'::app_role)
      AND ur.user_id <> coalesce(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid)
      AND has_notification_agency_access(ur.user_id, NEW.imobiliaria::text)
  LOOP
    INSERT INTO public.notifications
      (user_id, tipo, category, titulo, mensagem, link, imobiliaria,
       entity_type, entity_id, actor_id, dedup_key)
    VALUES
      (_r.user_id, 'agenda_fotos', 'agenda', _titulo, _mensagem, '/agenda/fotos',
       NEW.imobiliaria::text, 'agenda_event', NEW.id, NEW.created_by,
       _dedup_base || ':' || _r.user_id::text)
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agenda_events_notify_photo_session ON public.agenda_events;
CREATE TRIGGER agenda_events_notify_photo_session
AFTER INSERT OR UPDATE ON public.agenda_events
FOR EACH ROW EXECUTE FUNCTION public.agenda_notify_photo_session();