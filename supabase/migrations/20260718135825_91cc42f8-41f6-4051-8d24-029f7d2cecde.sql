
DROP POLICY IF EXISTS "Users select own attendances or admin" ON public.attendances;
CREATE POLICY "Users select own attendances or admin"
  ON public.attendances FOR SELECT
  USING (
    created_by = auth.uid()
    OR corretor_id = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Users update own attendances or admin" ON public.attendances;
CREATE POLICY "Users update own attendances or admin"
  ON public.attendances FOR UPDATE
  USING (
    created_by = auth.uid()
    OR corretor_id = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    created_by = auth.uid()
    OR corretor_id = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.notify_atendimento_corretor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_should_notify boolean := false;
  v_target uuid;
  v_msg text;
  v_orcamento text;
BEGIN
  IF NEW.corretor_id IS NULL OR trim(NEW.corretor_id) = '' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_target := NEW.corretor_id::uuid;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  IF TG_OP = 'INSERT' THEN
    v_should_notify := (v_target IS DISTINCT FROM NEW.created_by);
  ELSIF TG_OP = 'UPDATE' THEN
    v_should_notify := (NEW.corretor_id IS DISTINCT FROM OLD.corretor_id)
      AND (v_target IS DISTINCT FROM NEW.created_by);
  END IF;

  IF NOT v_should_notify THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_target) THEN
    RETURN NEW;
  END IF;

  v_orcamento := CASE
    WHEN NEW.orcamento_min IS NOT NULL AND NEW.orcamento_max IS NOT NULL THEN
      'Orçamento: R$ ' || to_char(NEW.orcamento_min, 'FM999G999G990D00') ||
      ' – R$ ' || to_char(NEW.orcamento_max, 'FM999G999G990D00')
    WHEN NEW.orcamento_max IS NOT NULL THEN
      'Orçamento até R$ ' || to_char(NEW.orcamento_max, 'FM999G999G990D00')
    WHEN NEW.orcamento_min IS NOT NULL THEN
      'Orçamento a partir de R$ ' || to_char(NEW.orcamento_min, 'FM999G999G990D00')
    ELSE NULL
  END;

  v_msg := concat_ws(' • ',
    NULLIF(trim(NEW.cliente_nome), ''),
    NULLIF(trim(NEW.telefone), ''),
    CASE
      WHEN NEW.finalidade IS NOT NULL AND NEW.tipo_imovel IS NOT NULL
        THEN 'Interesse: ' || NEW.finalidade || ' / ' || NEW.tipo_imovel
      WHEN NEW.finalidade IS NOT NULL THEN 'Interesse: ' || NEW.finalidade
      ELSE NULL
    END,
    NULLIF(trim(NEW.bairro_interesse), ''),
    v_orcamento,
    CASE WHEN NEW.proximo_passo IS NOT NULL
      THEN 'Próximo passo: ' || NEW.proximo_passo ELSE NULL END
  );

  INSERT INTO public.notifications (user_id, tipo, titulo, mensagem, link)
  VALUES (
    v_target,
    'atendimento_atribuido',
    'Novo atendimento atribuído a você',
    NULLIF(v_msg, ''),
    '/atendimentos?id=' || NEW.id::text
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_atendimento_corretor ON public.attendances;
CREATE TRIGGER trg_notify_atendimento_corretor
AFTER INSERT OR UPDATE OF corretor_id ON public.attendances
FOR EACH ROW EXECUTE FUNCTION public.notify_atendimento_corretor();
