
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_by uuid;

CREATE OR REPLACE FUNCTION public.mark_attendance_opened(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.attendances%ROWTYPE;
  v_uid uuid := auth.uid();
  v_corretor_nome text;
  v_admin record;
  v_titulo text;
  v_mensagem text;
  v_link text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_row FROM public.attendances WHERE id = _id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Somente o corretor atribuído pode marcar como aberto
  IF v_row.corretor_id IS NULL OR v_row.corretor_id <> v_uid::text THEN
    RETURN;
  END IF;

  -- Idempotência
  IF v_row.opened_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.attendances
    SET opened_at = now(), opened_by = v_uid
    WHERE id = _id;

  SELECT COALESCE(p.nome, v_row.corretor_nome, 'Corretor')
    INTO v_corretor_nome
    FROM public.profiles p
    WHERE p.id = v_uid;

  v_titulo := 'Atendimento iniciado por ' || COALESCE(v_corretor_nome, 'corretor');
  v_mensagem := 'Cliente: ' || COALESCE(v_row.cliente_nome, '-') ||
                CASE WHEN v_row.telefone IS NOT NULL AND v_row.telefone <> '' THEN ' · Tel: ' || v_row.telefone ELSE '' END ||
                CASE WHEN v_row.bairro_interesse IS NOT NULL AND v_row.bairro_interesse <> '' THEN ' · Bairro: ' || v_row.bairro_interesse ELSE '' END ||
                CASE WHEN v_row.finalidade IS NOT NULL THEN ' · ' || v_row.finalidade ELSE '' END;
  v_link := '/atendimentos?id=' || _id::text;

  FOR v_admin IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'::public.app_role
  LOOP
    INSERT INTO public.notifications (user_id, tipo, titulo, mensagem, link, lida)
    VALUES (v_admin.user_id, 'atendimento_iniciado', v_titulo, v_mensagem, v_link, false);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_attendance_opened(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_attendance_opened(uuid) TO authenticated;
