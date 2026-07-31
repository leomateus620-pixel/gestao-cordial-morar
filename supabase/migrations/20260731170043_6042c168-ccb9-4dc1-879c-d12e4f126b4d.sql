-- 1. finalidade column
ALTER TABLE public.agenciamentos
  ADD COLUMN IF NOT EXISTS finalidade TEXT;

ALTER TABLE public.agenciamentos
  DROP CONSTRAINT IF EXISTS agenciamentos_finalidade_check;
ALTER TABLE public.agenciamentos
  ADD CONSTRAINT agenciamentos_finalidade_check
  CHECK (finalidade IS NULL OR finalidade IN ('venda', 'aluguel'));

CREATE INDEX IF NOT EXISTS agenciamentos_finalidade_idx
  ON public.agenciamentos (finalidade);
CREATE INDEX IF NOT EXISTS agenciamentos_corretor_idx
  ON public.agenciamentos (corretor_id);

-- 2. bonuses table
CREATE TABLE IF NOT EXISTS public.agenciamento_bonuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  corretor_id UUID NOT NULL,
  corretor_nome TEXT,
  categoria TEXT NOT NULL CHECK (categoria IN ('venda', 'aluguel')),
  periodo_ref DATE,
  nivel INTEGER NOT NULL CHECK (nivel > 0),
  listings_count INTEGER NOT NULL DEFAULT 0,
  placas_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovada', 'paga', 'cancelada')),
  achieved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agenciamento_bonuses_unique_idx
  ON public.agenciamento_bonuses (
    corretor_id, categoria, COALESCE(periodo_ref, DATE '1900-01-01'), nivel
  );

GRANT SELECT, UPDATE ON public.agenciamento_bonuses TO authenticated;
GRANT ALL ON public.agenciamento_bonuses TO service_role;

ALTER TABLE public.agenciamento_bonuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bonuses_select_scope" ON public.agenciamento_bonuses;
CREATE POLICY "bonuses_select_scope" ON public.agenciamento_bonuses
  FOR SELECT TO authenticated
  USING (
    corretor_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  );

DROP POLICY IF EXISTS "bonuses_update_admin" ON public.agenciamento_bonuses;
CREATE POLICY "bonuses_update_admin" ON public.agenciamento_bonuses
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS agenciamento_bonuses_touch ON public.agenciamento_bonuses;
CREATE TRIGGER agenciamento_bonuses_touch
  BEFORE UPDATE ON public.agenciamento_bonuses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. notification helper
CREATE OR REPLACE FUNCTION public.agenciamento_bonus_notify(_bonus public.agenciamento_bonuses)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_label TEXT;
  v_period TEXT;
  v_name TEXT;
  v_recipient RECORD;
BEGIN
  v_label := CASE WHEN _bonus.categoria = 'venda' THEN 'Venda' ELSE 'Aluguel' END;
  v_period := CASE
    WHEN _bonus.periodo_ref IS NULL THEN 'acumulado'
    ELSE to_char(_bonus.periodo_ref, 'MM/YYYY')
  END;
  SELECT COALESCE(p.nome, _bonus.corretor_nome, 'Corretor') INTO v_name
  FROM public.profiles p WHERE p.id = _bonus.corretor_id;

  BEGIN
    INSERT INTO public.notifications
      (user_id, tipo, category, titulo, mensagem, link, imobiliaria, dedup_key)
    VALUES (
      _bonus.corretor_id,
      'agenciamento_bonificacao',
      'system',
      'Bonificação de agenciamento conquistada',
      'Meta de ' || v_label || ' atingida (' || v_period || '): '
        || _bonus.listings_count || ' captações'
        || CASE WHEN _bonus.categoria = 'venda'
             THEN ' e ' || _bonus.placas_count || ' placas' ELSE '' END
        || '. Bonificação nº ' || _bonus.nivel || '.',
      '/agenciamentos?bonus=' || _bonus.id::TEXT,
      NULL,
      'bonus:' || _bonus.id::TEXT || ':' || _bonus.corretor_id::TEXT
    )
    ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'bonus broker notification failed: %', SQLERRM;
  END;

  FOR v_recipient IN
    SELECT user_id FROM public.user_roles
    WHERE role = 'admin'::public.app_role AND user_id <> _bonus.corretor_id
  LOOP
    BEGIN
      INSERT INTO public.notifications
        (user_id, tipo, category, titulo, mensagem, link, imobiliaria, dedup_key)
      VALUES (
        v_recipient.user_id,
        'agenciamento_bonificacao',
        'system',
        'Bonificação de agenciamento: ' || COALESCE(v_name, 'Corretor'),
        v_label || ' · ' || v_period || ' · ' || _bonus.listings_count || ' captações'
          || CASE WHEN _bonus.categoria = 'venda'
               THEN ' / ' || _bonus.placas_count || ' placas' ELSE '' END
          || '. Bonificação nº ' || _bonus.nivel || ' aguardando conferência.',
        '/corretores?corretorId=' || _bonus.corretor_id::TEXT,
        NULL,
        'bonus:' || _bonus.id::TEXT || ':' || v_recipient.user_id::TEXT
      )
      ON CONFLICT (dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'bonus admin notification failed: %', SQLERRM;
    END;
  END LOOP;
END;
$$;

-- 4. recalculation
CREATE OR REPLACE FUNCTION public.agenciamento_bonus_recalc(_corretor_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_nome TEXT;
  v_period RECORD;
  v_levels INTEGER;
  v_level INTEGER;
  v_total INTEGER;
  v_inserted public.agenciamento_bonuses%ROWTYPE;
BEGIN
  IF _corretor_id IS NULL THEN RETURN; END IF;
  SELECT nome INTO v_nome FROM public.profiles WHERE id = _corretor_id;

  -- Sales: monthly, min(floor(n/8), floor(placas/4))
  FOR v_period IN
    SELECT date_trunc('month', a.data_agenciamento)::DATE AS periodo,
           count(*)::INT AS total,
           count(*) FILTER (WHERE a.placa_instalada)::INT AS placas
    FROM public.agenciamentos a
    WHERE public._try_uuid(a.corretor_id) = _corretor_id
      AND a.finalidade = 'venda'
      AND a.status <> 'cancelado'
    GROUP BY 1
  LOOP
    v_levels := LEAST(v_period.total / 8, v_period.placas / 4);
    FOR v_level IN 1..GREATEST(v_levels, 0) LOOP
      INSERT INTO public.agenciamento_bonuses
        (corretor_id, corretor_nome, categoria, periodo_ref, nivel, listings_count, placas_count)
      VALUES (_corretor_id, v_nome, 'venda', v_period.periodo, v_level, v_period.total, v_period.placas)
      ON CONFLICT DO NOTHING
      RETURNING * INTO v_inserted;
      IF v_inserted.id IS NOT NULL THEN
        PERFORM public.agenciamento_bonus_notify(v_inserted);
        v_inserted := NULL;
      END IF;
    END LOOP;
    UPDATE public.agenciamento_bonuses
    SET status = 'cancelada'
    WHERE corretor_id = _corretor_id
      AND categoria = 'venda'
      AND periodo_ref = v_period.periodo
      AND nivel > GREATEST(v_levels, 0)
      AND status = 'pendente';
  END LOOP;

  -- Rentals: cumulative, 1 per 10
  SELECT count(*)::INT INTO v_total
  FROM public.agenciamentos a
  WHERE public._try_uuid(a.corretor_id) = _corretor_id
    AND a.finalidade = 'aluguel'
    AND a.status <> 'cancelado';

  v_levels := COALESCE(v_total, 0) / 10;
  FOR v_level IN 1..GREATEST(v_levels, 0) LOOP
    INSERT INTO public.agenciamento_bonuses
      (corretor_id, corretor_nome, categoria, periodo_ref, nivel, listings_count, placas_count)
    VALUES (_corretor_id, v_nome, 'aluguel', NULL, v_level, v_level * 10, 0)
    ON CONFLICT DO NOTHING
    RETURNING * INTO v_inserted;
    IF v_inserted.id IS NOT NULL THEN
      PERFORM public.agenciamento_bonus_notify(v_inserted);
      v_inserted := NULL;
    END IF;
  END LOOP;

  UPDATE public.agenciamento_bonuses
  SET status = 'cancelada'
  WHERE corretor_id = _corretor_id
    AND categoria = 'aluguel'
    AND nivel > GREATEST(v_levels, 0)
    AND status = 'pendente';
END;
$$;

CREATE OR REPLACE FUNCTION public.agenciamentos_bonus_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new UUID;
  v_old UUID;
BEGIN
  IF TG_OP <> 'DELETE' THEN v_new := public._try_uuid(NEW.corretor_id); END IF;
  IF TG_OP <> 'INSERT' THEN v_old := public._try_uuid(OLD.corretor_id); END IF;

  IF v_new IS NOT NULL THEN PERFORM public.agenciamento_bonus_recalc(v_new); END IF;
  IF v_old IS NOT NULL AND v_old IS DISTINCT FROM v_new THEN
    PERFORM public.agenciamento_bonus_recalc(v_old);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS agenciamentos_bonus_sync_trg ON public.agenciamentos;
CREATE TRIGGER agenciamentos_bonus_sync_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.agenciamentos
  FOR EACH ROW EXECUTE FUNCTION public.agenciamentos_bonus_sync();