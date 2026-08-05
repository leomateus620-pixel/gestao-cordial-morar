ALTER TABLE public.agenciamentos
  ADD COLUMN IF NOT EXISTS fotos_horizontal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fotos_vertical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cadastrado_morar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cadastrado_cordial boolean NOT NULL DEFAULT false;

UPDATE public.agenciamentos
SET fotos_horizontal = fotos_realizadas,
    fotos_vertical = fotos_realizadas,
    cadastrado_morar = cadastrado_site,
    cadastrado_cordial = cadastrado_site
WHERE fotos_horizontal = false
  AND fotos_vertical = false
  AND cadastrado_morar = false
  AND cadastrado_cordial = false;

CREATE OR REPLACE FUNCTION public.agenciamento_bonus_recalc(_corretor_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Sales: monthly, min(floor(n/8), floor(placas/4)); only fully-checked listings count
  FOR v_period IN
    SELECT date_trunc('month', a.data_agenciamento)::DATE AS periodo,
           count(*)::INT AS total,
           count(*) FILTER (WHERE a.placa_instalada)::INT AS placas
    FROM public.agenciamentos a
    WHERE public._try_uuid(a.corretor_id) = _corretor_id
      AND a.finalidade = 'venda'
      AND a.status <> 'cancelado'
      AND a.fotos_horizontal AND a.fotos_vertical
      AND a.cadastrado_morar AND a.cadastrado_cordial
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

  -- Rentals: cumulative, 1 per 10; only fully-checked listings count
  SELECT count(*)::INT INTO v_total
  FROM public.agenciamentos a
  WHERE public._try_uuid(a.corretor_id) = _corretor_id
    AND a.finalidade = 'aluguel'
    AND a.status <> 'cancelado'
    AND a.fotos_horizontal AND a.fotos_vertical
    AND a.cadastrado_morar AND a.cadastrado_cordial;

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
$function$;