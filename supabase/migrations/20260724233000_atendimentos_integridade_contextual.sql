-- Atendimentos CRM: canonical interest/property fields and one contextual
-- structured history event per meaningful mutation.

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS imovel_ref TEXT,
  ADD COLUMN IF NOT EXISTS interesse_descricao TEXT,
  ADD COLUMN IF NOT EXISTS imovel_endereco TEXT,
  ADD COLUMN IF NOT EXISTS imovel_bairro TEXT,
  ADD COLUMN IF NOT EXISTS imovel_cidade TEXT,
  ADD COLUMN IF NOT EXISTS imovel_tipo TEXT,
  ADD COLUMN IF NOT EXISTS imovel_valor NUMERIC(14, 2);

CREATE INDEX IF NOT EXISTS idx_attendances_imovel_ref
  ON public.attendances(imovel_ref)
  WHERE imovel_ref IS NOT NULL;

DROP POLICY IF EXISTS "Attendance staff can view assignment profiles" ON public.profiles;
CREATE POLICY "Attendance staff can view assignment profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'secretaria'::public.app_role)
  );

-- Rows without a relationship were using imovel_descricao as free-form interest
-- text. Preserve that content in its canonical column, then remove the ambiguous
-- pseudo-property snapshot. Linked rows are intentionally untouched.
UPDATE public.attendances
SET
  interesse_descricao = COALESCE(interesse_descricao, imovel_descricao),
  imovel_descricao = NULL,
  imovel_codigo = NULL
WHERE imovel_id IS NULL
  AND imovel_ref IS NULL
  AND imovel_descricao IS NOT NULL;

CREATE OR REPLACE FUNCTION public.attendances_log_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_name TEXT;
  v_event_type TEXT := 'attendance_update';
  v_description TEXT;
  v_fields TEXT[] := ARRAY[]::TEXT[];
  v_previous JSONB := '{}'::JSONB;
  v_new JSONB := '{}'::JSONB;
BEGIN
  SELECT nome INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.attendance_history (
      attendance_id,
      client_id,
      event_type,
      actor_id,
      actor_name,
      description,
      new_value,
      metadata,
      source
    )
    VALUES (
      NEW.id,
      NEW.cliente_id,
      'criacao',
      v_actor,
      v_actor_name,
      'Atendimento criado em ' || initcap(replace(NEW.pipeline_stage::TEXT, '_', ' ')) || '.',
      jsonb_build_object(
        'status', NEW.status,
        'pipeline_stage', NEW.pipeline_stage,
        'corretor_id', NEW.corretor_id,
        'corretor_nome', NEW.corretor_nome
      ),
      jsonb_build_object('changed_fields', jsonb_build_array('criacao')),
      'trigger'
    );
    RETURN NEW;
  END IF;

  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
    v_fields := array_append(v_fields, 'etapa');
    v_previous := v_previous || jsonb_build_object('pipeline_stage', OLD.pipeline_stage);
    v_new := v_new || jsonb_build_object('pipeline_stage', NEW.pipeline_stage);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_fields := array_append(v_fields, 'status');
    v_previous := v_previous || jsonb_build_object('status', OLD.status);
    v_new := v_new || jsonb_build_object('status', NEW.status);
  END IF;

  IF ROW(NEW.corretor_id, NEW.corretor_nome)
    IS DISTINCT FROM ROW(OLD.corretor_id, OLD.corretor_nome) THEN
    v_fields := array_append(v_fields, 'corretor');
    v_previous := v_previous || jsonb_build_object(
      'corretor_id', OLD.corretor_id,
      'corretor_nome', OLD.corretor_nome
    );
    v_new := v_new || jsonb_build_object(
      'corretor_id', NEW.corretor_id,
      'corretor_nome', NEW.corretor_nome
    );
  END IF;

  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    v_fields := array_append(v_fields, 'cliente');
    v_previous := v_previous || jsonb_build_object('cliente_id', OLD.cliente_id);
    v_new := v_new || jsonb_build_object('cliente_id', NEW.cliente_id);
  END IF;

  IF ROW(
      NEW.imovel_id,
      NEW.imovel_ref,
      NEW.imovel_codigo,
      NEW.imovel_descricao,
      NEW.imovel_endereco,
      NEW.imovel_bairro,
      NEW.imovel_cidade,
      NEW.imovel_tipo,
      NEW.imovel_valor
    ) IS DISTINCT FROM ROW(
      OLD.imovel_id,
      OLD.imovel_ref,
      OLD.imovel_codigo,
      OLD.imovel_descricao,
      OLD.imovel_endereco,
      OLD.imovel_bairro,
      OLD.imovel_cidade,
      OLD.imovel_tipo,
      OLD.imovel_valor
    ) THEN
    v_fields := array_append(v_fields, 'imóvel');
    v_previous := v_previous || jsonb_build_object(
      'imovel_id', COALESCE(OLD.imovel_ref, OLD.imovel_id::TEXT),
      'imovel_codigo', OLD.imovel_codigo,
      'imovel_descricao', OLD.imovel_descricao
    );
    v_new := v_new || jsonb_build_object(
      'imovel_id', COALESCE(NEW.imovel_ref, NEW.imovel_id::TEXT),
      'imovel_codigo', NEW.imovel_codigo,
      'imovel_descricao', NEW.imovel_descricao
    );
  END IF;

  IF NEW.proximo_retorno IS DISTINCT FROM OLD.proximo_retorno THEN
    v_fields := array_append(v_fields, 'próximo retorno');
    v_previous := v_previous || jsonb_build_object('proximo_retorno', OLD.proximo_retorno);
    v_new := v_new || jsonb_build_object('proximo_retorno', NEW.proximo_retorno);
  END IF;

  IF NEW.proximo_passo IS DISTINCT FROM OLD.proximo_passo THEN
    v_fields := array_append(v_fields, 'próxima ação');
    v_previous := v_previous || jsonb_build_object('proximo_passo', OLD.proximo_passo);
    v_new := v_new || jsonb_build_object('proximo_passo', NEW.proximo_passo);
  END IF;

  IF ROW(
      NEW.cliente_nome,
      NEW.telefone,
      NEW.email,
      NEW.contato_preferencial
    ) IS DISTINCT FROM ROW(
      OLD.cliente_nome,
      OLD.telefone,
      OLD.email,
      OLD.contato_preferencial
    ) THEN
    v_fields := array_append(v_fields, 'contato');
    v_previous := v_previous || jsonb_build_object(
      'cliente_nome', OLD.cliente_nome,
      'telefone', OLD.telefone,
      'email', OLD.email,
      'contato_preferencial', OLD.contato_preferencial
    );
    v_new := v_new || jsonb_build_object(
      'cliente_nome', NEW.cliente_nome,
      'telefone', NEW.telefone,
      'email', NEW.email,
      'contato_preferencial', NEW.contato_preferencial
    );
  END IF;

  IF ROW(
      NEW.origem,
      NEW.imobiliaria,
      NEW.finalidade,
      NEW.tipo_imovel,
      NEW.dormitorios,
      NEW.bairro_interesse,
      NEW.orcamento_min,
      NEW.orcamento_max,
      NEW.prioridade,
      NEW.interesse_descricao
    ) IS DISTINCT FROM ROW(
      OLD.origem,
      OLD.imobiliaria,
      OLD.finalidade,
      OLD.tipo_imovel,
      OLD.dormitorios,
      OLD.bairro_interesse,
      OLD.orcamento_min,
      OLD.orcamento_max,
      OLD.prioridade,
      OLD.interesse_descricao
    ) THEN
    v_fields := array_append(v_fields, 'interesse comercial');
    v_previous := v_previous || jsonb_build_object(
      'origem', OLD.origem,
      'imobiliaria', OLD.imobiliaria,
      'finalidade', OLD.finalidade,
      'tipo_imovel', OLD.tipo_imovel,
      'dormitorios', OLD.dormitorios,
      'bairro_interesse', OLD.bairro_interesse,
      'orcamento_min', OLD.orcamento_min,
      'orcamento_max', OLD.orcamento_max,
      'prioridade', OLD.prioridade,
      'interesse_descricao', OLD.interesse_descricao
    );
    v_new := v_new || jsonb_build_object(
      'origem', NEW.origem,
      'imobiliaria', NEW.imobiliaria,
      'finalidade', NEW.finalidade,
      'tipo_imovel', NEW.tipo_imovel,
      'dormitorios', NEW.dormitorios,
      'bairro_interesse', NEW.bairro_interesse,
      'orcamento_min', NEW.orcamento_min,
      'orcamento_max', NEW.orcamento_max,
      'prioridade', NEW.prioridade,
      'interesse_descricao', NEW.interesse_descricao
    );
  END IF;

  IF NEW.observacoes IS DISTINCT FROM OLD.observacoes THEN
    v_fields := array_append(v_fields, 'observações internas');
    v_previous := v_previous || jsonb_build_object('observacoes', OLD.observacoes);
    v_new := v_new || jsonb_build_object('observacoes', NEW.observacoes);
  END IF;

  IF ROW(
      NEW.convertido_em_cliente,
      NEW.cliente_convertido_id
    ) IS DISTINCT FROM ROW(
      OLD.convertido_em_cliente,
      OLD.cliente_convertido_id
    ) THEN
    v_fields := array_append(v_fields, 'vínculo de cliente');
    v_previous := v_previous || jsonb_build_object(
      'convertido_em_cliente', OLD.convertido_em_cliente,
      'cliente_convertido_id', OLD.cliente_convertido_id
    );
    v_new := v_new || jsonb_build_object(
      'convertido_em_cliente', NEW.convertido_em_cliente,
      'cliente_convertido_id', NEW.cliente_convertido_id
    );
  END IF;

  IF NEW.motivo_perda IS DISTINCT FROM OLD.motivo_perda THEN
    v_fields := array_append(v_fields, 'motivo da perda');
    v_previous := v_previous || jsonb_build_object('motivo_perda', OLD.motivo_perda);
    v_new := v_new || jsonb_build_object('motivo_perda', NEW.motivo_perda);
  END IF;

  -- opened_at/opened_by and touch timestamps are deliberately excluded.
  IF cardinality(v_fields) = 0 THEN
    RETURN NEW;
  END IF;

  IF cardinality(v_fields) = 1 AND v_fields[1] = 'etapa' THEN
    v_event_type := 'stage_change';
    v_description :=
      'Etapa alterada de ' ||
      initcap(replace(OLD.pipeline_stage::TEXT, '_', ' ')) ||
      ' para ' ||
      initcap(replace(NEW.pipeline_stage::TEXT, '_', ' ')) ||
      '.';
  ELSIF cardinality(v_fields) = 1 AND v_fields[1] = 'status' THEN
    v_event_type := 'status_change';
    v_description :=
      'Status alterado de ' ||
      initcap(replace(OLD.status, '_', ' ')) ||
      ' para ' ||
      initcap(replace(NEW.status, '_', ' ')) ||
      '.';
  ELSIF cardinality(v_fields) = 1 AND v_fields[1] = 'corretor' THEN
    v_event_type := 'broker_change';
    v_description :=
      'Corretor responsável alterado de ' ||
      COALESCE(OLD.corretor_nome, 'A definir') ||
      ' para ' ||
      COALESCE(NEW.corretor_nome, 'A definir') ||
      '.';
  ELSIF cardinality(v_fields) = 1 AND v_fields[1] = 'imóvel' THEN
    v_event_type := 'property_link';
    v_description :=
      'Imóvel vinculado alterado de ' ||
      COALESCE(OLD.imovel_descricao, OLD.imovel_codigo, 'Nenhum imóvel') ||
      ' para ' ||
      COALESCE(NEW.imovel_descricao, NEW.imovel_codigo, 'Nenhum imóvel') ||
      '.';
  ELSIF cardinality(v_fields) = 1 AND v_fields[1] = 'próximo retorno' THEN
    v_event_type := 'next_return';
    v_description := CASE
      WHEN NEW.proximo_retorno IS NULL THEN 'Próximo retorno removido.'
      ELSE 'Próximo retorno agendado para ' ||
        to_char(NEW.proximo_retorno AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') ||
        '.'
    END;
  ELSIF cardinality(v_fields) = 1 AND v_fields[1] = 'próxima ação' THEN
    v_event_type := 'next_action';
    v_description := CASE
      WHEN NEW.proximo_passo IS NULL THEN 'Próxima ação removida.'
      ELSE 'Próxima ação definida como ' ||
        initcap(replace(NEW.proximo_passo, '_', ' ')) ||
        '.'
    END;
  ELSE
    v_description := 'Atendimento atualizado: ' || array_to_string(v_fields, ', ') || '.';
  END IF;

  INSERT INTO public.attendance_history (
    attendance_id,
    client_id,
    event_type,
    actor_id,
    actor_name,
    description,
    previous_value,
    new_value,
    metadata,
    source
  )
  VALUES (
    NEW.id,
    NEW.cliente_id,
    v_event_type,
    v_actor,
    v_actor_name,
    v_description,
    v_previous,
    v_new,
    jsonb_build_object('changed_fields', to_jsonb(v_fields)),
    'trigger'
  );

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
