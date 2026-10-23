CREATE TABLE public.property_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_name text NOT NULL DEFAULT 'Sistema',
  actor_kind text NOT NULL DEFAULT 'system' CHECK (actor_kind IN ('user','system','sync_imobi','assistant','worker')),
  category text NOT NULL CHECK (category IN ('criacao','caracteristicas','valores','endereco','descricao','operacao','documentacao','codigos','publicacao','corretor','dados_privados','arquivamento','fotos','videos')),
  title text NOT NULL,
  summary text,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_id text,
  tx_id bigint NOT NULL DEFAULT txid_current(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX property_history_property_created_idx ON public.property_history (property_id, created_at DESC, id DESC);
CREATE INDEX property_history_property_category_idx ON public.property_history (property_id, category, created_at DESC);
CREATE INDEX property_history_tx_idx ON public.property_history (property_id, tx_id, category);

REVOKE ALL ON public.property_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.property_history TO service_role;
ALTER TABLE public.property_history ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.property_history IS 'Linha do tempo do imóvel; leitura só por property_history_list (mascara dados privados); escrita só por gatilhos.';

-- Grava ou funde (mesma transação + mesma seção) um evento.
CREATE OR REPLACE FUNCTION public.property_history_record(
  _property_id uuid, _category text, _title text, _changes jsonb, _summary text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _kind text := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-history-actor';
  _name text;
  _existing public.property_history%ROWTYPE;
  _merged jsonb;
BEGIN
  SELECT * INTO _existing FROM public.property_history
   WHERE property_id = _property_id AND tx_id = txid_current() AND category = _category
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    IF _category IN ('fotos','videos') THEN
      UPDATE public.property_history SET title = _title, summary = coalesce(_summary, summary),
        changes = changes || _changes WHERE id = _existing.id;
    ELSE
      SELECT coalesce(jsonb_agg(c), '[]'::jsonb) INTO _merged FROM (
        SELECT jsonb_build_object('field', f, 'from', fr, 'to', t, 'sensitive', s) c
        FROM (
          SELECT e->>'field' f,
                 (array_agg(e->'from' ORDER BY o))[1] fr,
                 (array_agg(e->'to' ORDER BY o DESC))[1] t,
                 bool_or((e->>'sensitive')::boolean) s
          FROM (SELECT e, o FROM jsonb_array_elements(_existing.changes || _changes) WITH ORDINALITY x(e, o)) z
          GROUP BY e->>'field'
        ) g WHERE fr IS DISTINCT FROM t
      ) q;
      UPDATE public.property_history SET changes = _merged, title = _title WHERE id = _existing.id;
    END IF;
    RETURN;
  END IF;

  IF _uid IS NOT NULL THEN
    SELECT nome INTO _name FROM public.profiles WHERE id = _uid;
    INSERT INTO public.property_history (property_id, actor_user_id, actor_name, actor_kind, category, title, summary, changes)
    VALUES (_property_id, _uid, coalesce(nullif(trim(_name), ''), 'Usuário'),
            CASE WHEN _kind = 'assistant' THEN 'assistant' ELSE 'user' END,
            _category, _title, _summary, _changes);
  ELSE
    INSERT INTO public.property_history (property_id, actor_name, actor_kind, category, title, summary, changes)
    VALUES (_property_id,
            CASE _kind WHEN 'sync_imobi' THEN 'Sync Imobi' WHEN 'worker' THEN 'Sistema' ELSE 'Sistema' END,
            CASE WHEN _kind IN ('sync_imobi','worker') THEN _kind ELSE 'system' END,
            _category, _title, _summary, _changes);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.property_history_record(uuid, text, text, jsonb, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.property_history_on_property()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o jsonb; n jsonb; r record; _changes jsonb; _cat text;
  _labels jsonb := '{"caracteristicas":"Editado Características","valores":"Editado Valores","endereco":"Editado Endereço","descricao":"Editado Descrição","operacao":"Editado Operação e exibição","documentacao":"Editado Documentação","codigos":"Códigos alterados","publicacao":"Sites de publicação alterados","corretor":"Corretor alterado","dados_privados":"Editado Dados Privados"}';
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.property_history_record(NEW.id, 'criacao', 'Imóvel cadastrado', '[]'::jsonb);
    RETURN NULL;
  END IF;
  o := to_jsonb(OLD); n := to_jsonb(NEW);
  FOR _cat IN SELECT DISTINCT s FROM public.property_history_fields() ORDER BY 1 LOOP
    SELECT coalesce(jsonb_agg(jsonb_build_object('field', f.col, 'from', o->f.col, 'to', n->f.col, 'sensitive', f.sensitive) ORDER BY f.ord), '[]'::jsonb)
      INTO _changes
      FROM public.property_history_fields() f
     WHERE f.s = _cat AND (o->f.col) IS DISTINCT FROM (n->f.col);
    IF jsonb_array_length(_changes) > 0 THEN
      PERFORM public.property_history_record(NEW.id, _cat, _labels->>_cat, _changes);
    END IF;
  END LOOP;
  IF OLD.removal_state IS DISTINCT FROM NEW.removal_state THEN
    PERFORM public.property_history_record(NEW.id, 'arquivamento',
      CASE NEW.removal_state WHEN 'archived' THEN 'Imóvel arquivado' WHEN 'pending_archive' THEN 'Arquivamento solicitado'
        ELSE 'Imóvel reativado' END,
      jsonb_build_array(jsonb_build_object('field','removal_state','from',o->'removal_state','to',n->'removal_state','sensitive',false)));
  END IF;
  IF OLD.registration_completed_at IS NULL AND NEW.registration_completed_at IS NOT NULL THEN
    PERFORM public.property_history_record(NEW.id, 'criacao', 'Cadastro concluído', '[]'::jsonb);
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'property_history failed: %', SQLSTATE;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.property_history_fields()
RETURNS TABLE (ord int, col text, s text, sensitive boolean)
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (row_number() OVER ())::int, c, s, s = 'dados_privados' FROM (VALUES
  ('tipo','caracteristicas'),('dormitorios','caracteristicas'),('suites','caracteristicas'),('banheiros','caracteristicas'),
  ('vagas','caracteristicas'),('salas','caracteristicas'),('acomodacoes','caracteristicas'),('area_principal','caracteristicas'),
  ('area_tipo','caracteristicas'),('area_total','caracteristicas'),('area_util','caracteristicas'),('area_construida','caracteristicas'),
  ('area_terreno','caracteristicas'),('area_privativa','caracteristicas'),('terreno_frente','caracteristicas'),('terreno_fundo','caracteristicas'),
  ('terreno_esquerda','caracteristicas'),('terreno_direita','caracteristicas'),('pavimento','caracteristicas'),('numero_andar','caracteristicas'),
  ('mobiliado','caracteristicas'),('ano_construcao','caracteristicas'),('caracteristicas','caracteristicas'),('em_condominio','caracteristicas'),
  ('nome_condominio','caracteristicas'),
  ('valor','valores'),('valor_modo','valores'),('valor_exibido','valores'),('valor_iptu','valores'),('valor_condominio','valores'),
  ('valor_taxas','valores'),('aceita_financiamento','valores'),('permuta','valores'),
  ('cep','endereco'),('logradouro','endereco'),('numero','endereco'),('complemento','endereco'),('bairro','endereco'),('cidade','endereco'),
  ('uf','endereco'),('zona','endereco'),('regiao','endereco'),('ponto_referencia','endereco'),('exibir_endereco_site','endereco'),
  ('localizacao_exibida','endereco'),('localizacao_maps_url','endereco'),
  ('descricao_imovel','descricao'),('pontos_fortes','descricao'),('nome_empreendimento','descricao'),('unidade','descricao'),
  ('video','descricao'),('tour_virtual','descricao'),('seo_titulo','descricao'),('seo_descricao','descricao'),
  ('carteira','operacao'),('operacao','operacao'),('finalidade','operacao'),('disponibilidade','operacao'),('exibir_imovel','operacao'),
  ('destaque_inicial','operacao'),('super_destaque_inicial','operacao'),
  ('exclusividade','documentacao'),('autorizacao','documentacao'),('escriturada','documentacao'),('averbada','documentacao'),('com_placa','documentacao'),
  ('codigo','codigos'),('codigo_cordial','codigos'),('codigo_morar','codigos'),('referencia','codigos'),
  ('publish_targets','publicacao'),
  ('corretor_nome','corretor'),('origem_captacao','corretor'),
  ('proprietario_nome','dados_privados'),('proprietario_telefone','dados_privados'),('proprietario_email','dados_privados'),
  ('valor_observacao','dados_privados'),('observacao_imovel','dados_privados'),('outras_informacoes','dados_privados'),('local_chave','dados_privados')
  ) v(c, s)
$$;
REVOKE ALL ON FUNCTION public.property_history_on_property() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER property_history_insert AFTER INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.property_history_on_property();
CREATE TRIGGER property_history_update AFTER UPDATE ON public.properties
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.property_history_on_property();

-- Fotos: um evento por comando (e fundido por transação).
CREATE OR REPLACE FUNCTION public.property_history_on_images()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; _total int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR r IN SELECT property_id, count(*) c FROM new_rows WHERE NOT coalesce(pending_remote_delete,false) AND replacement_target_image_id IS NULL GROUP BY 1 LOOP
      SELECT count(*) INTO _total FROM public.property_images WHERE property_id = r.property_id AND NOT coalesce(pending_remote_delete,false);
      PERFORM public.property_history_record(r.property_id, 'fotos',
        CASE WHEN r.c = 1 THEN 'Imagem adicionada' ELSE r.c || ' imagens adicionadas' END || ' (Total: ' || _total || ')',
        jsonb_build_array(jsonb_build_object('field','fotos_adicionadas','from',null,'to',r.c,'sensitive',false)));
    END LOOP;
    FOR r IN SELECT property_id, count(*) c FROM new_rows WHERE replacement_target_image_id IS NOT NULL GROUP BY 1 LOOP
      PERFORM public.property_history_record(r.property_id, 'fotos', 'Imagem substituída',
        jsonb_build_array(jsonb_build_object('field','fotos_substituidas','from',null,'to',r.c,'sensitive',false)));
    END LOOP;
  ELSIF TG_OP = 'DELETE' THEN
    FOR r IN SELECT property_id, count(*) c FROM old_rows WHERE NOT coalesce(pending_remote_delete,false) GROUP BY 1 LOOP
      IF NOT EXISTS (SELECT 1 FROM public.properties WHERE id = r.property_id) THEN CONTINUE; END IF;
      SELECT count(*) INTO _total FROM public.property_images WHERE property_id = r.property_id AND NOT coalesce(pending_remote_delete,false);
      PERFORM public.property_history_record(r.property_id, 'fotos',
        CASE WHEN r.c = 1 THEN 'Imagem removida' ELSE r.c || ' imagens removidas' END || ' (Total: ' || _total || ')',
        jsonb_build_array(jsonb_build_object('field','fotos_removidas','from',null,'to',r.c,'sensitive',false)));
    END LOOP;
  ELSE
    FOR r IN SELECT n.property_id,
                    count(*) FILTER (WHERE NOT coalesce(o.pending_remote_delete,false) AND coalesce(n.pending_remote_delete,false)) removed,
                    count(*) FILTER (WHERE o.position IS DISTINCT FROM n.position AND NOT coalesce(n.pending_remote_delete,false)) moved,
                    count(*) FILTER (WHERE NOT coalesce(o.is_cover,false) AND coalesce(n.is_cover,false)) cover
               FROM new_rows n JOIN old_rows o ON o.id = n.id GROUP BY 1 LOOP
      IF r.removed > 0 THEN
        SELECT count(*) INTO _total FROM public.property_images WHERE property_id = r.property_id AND NOT coalesce(pending_remote_delete,false);
        PERFORM public.property_history_record(r.property_id, 'fotos',
          CASE WHEN r.removed = 1 THEN 'Imagem removida' ELSE r.removed || ' imagens removidas' END || ' (Total: ' || _total || ')',
          jsonb_build_array(jsonb_build_object('field','fotos_removidas','from',null,'to',r.removed,'sensitive',false)));
      ELSIF r.cover > 0 AND r.moved = 0 THEN
        PERFORM public.property_history_record(r.property_id, 'fotos', 'Capa trocada', '[]'::jsonb);
      ELSIF r.moved > 0 THEN
        PERFORM public.property_history_record(r.property_id, 'fotos', 'Ordem das imagens alterada',
          jsonb_build_array(jsonb_build_object('field','fotos_reordenadas','from',null,'to',r.moved,'sensitive',false)));
      END IF;
    END LOOP;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'property_history images failed: %', SQLSTATE;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.property_history_on_images() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER property_history_images_ins AFTER INSERT ON public.property_images
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.property_history_on_images();
CREATE TRIGGER property_history_images_del AFTER DELETE ON public.property_images
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public.property_history_on_images();
CREATE TRIGGER property_history_images_upd AFTER UPDATE ON public.property_images
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.property_history_on_images();

CREATE OR REPLACE FUNCTION public.property_history_on_videos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _total int; _pid uuid := coalesce(NEW.property_id, OLD.property_id);
BEGIN
  IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.properties WHERE id = _pid) THEN RETURN NULL; END IF;
  SELECT count(*) INTO _total FROM public.property_videos WHERE property_id = _pid;
  PERFORM public.property_history_record(_pid, 'videos',
    CASE TG_OP WHEN 'INSERT' THEN 'Vídeo adicionado' ELSE 'Vídeo removido' END || ' (Total: ' || _total || ')', '[]'::jsonb);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'property_history videos failed: %', SQLSTATE;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.property_history_on_videos() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER property_history_videos AFTER INSERT OR DELETE ON public.property_videos
  FOR EACH ROW EXECUTE FUNCTION public.property_history_on_videos();

-- Publicação: só transições relevantes e sem repetir o mesmo estado seguido.
CREATE OR REPLACE FUNCTION public.property_history_on_publication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _site text := CASE NEW.provider::text WHEN 'cordial' THEN 'Cordial' WHEN 'morar' THEN 'Morar' ELSE NEW.provider::text END;
  _last text;
BEGIN
  SELECT changes->0->>'to' INTO _last FROM public.property_history
   WHERE property_id = NEW.property_id AND category = 'publicacao' AND changes->0->>'field' = 'status_' || NEW.provider::text
   ORDER BY created_at DESC LIMIT 1;
  IF _last IS NOT DISTINCT FROM NEW.status::text THEN RETURN NULL; END IF;
  PERFORM public.property_history_record(NEW.property_id, 'publicacao',
    CASE NEW.status::text WHEN 'published' THEN 'Publicado no site ' || _site WHEN 'unpublished' THEN 'Retirado do site ' || _site
      WHEN 'conflict' THEN 'Conflito de código no site ' || _site ELSE 'Erro ao publicar no site ' || _site END,
    jsonb_build_array(jsonb_build_object('field','status_' || NEW.provider::text,'from',OLD.status::text,'to',NEW.status::text,'sensitive',false)));
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'property_history publication failed: %', SQLSTATE;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.property_history_on_publication() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER property_history_publication AFTER UPDATE OF status ON public.property_provider_publications
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status::text IN ('published','unpublished','error','conflict'))
  EXECUTE FUNCTION public.property_history_on_publication();

-- Leitura: equipe vê; valores privados só para admin/secretaria.
CREATE OR REPLACE FUNCTION public.property_history_list(
  _property_id uuid, _before timestamptz DEFAULT NULL, _before_id uuid DEFAULT NULL, _category text DEFAULT NULL, _limit int DEFAULT 20)
RETURNS TABLE (id uuid, actor_name text, actor_kind text, category text, title text, summary text, changes jsonb, created_at timestamptz, private_hidden boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _priv boolean;
BEGIN
  IF _uid IS NULL OR NOT (public.has_role(_uid,'admin') OR public.has_role(_uid,'secretaria') OR public.has_role(_uid,'corretor') OR public.has_role(_uid,'financeiro')) THEN
    RAISE EXCEPTION 'Sem permissão.' USING ERRCODE = '42501';
  END IF;
  _priv := public.has_role(_uid,'admin') OR public.has_role(_uid,'secretaria');
  RETURN QUERY
  SELECT h.id, h.actor_name, h.actor_kind, h.category, h.title, h.summary,
         CASE WHEN _priv THEN h.changes ELSE coalesce((
           SELECT jsonb_agg(CASE WHEN (e->>'sensitive')::boolean THEN e - 'from' - 'to' ELSE e END) FROM jsonb_array_elements(h.changes) e), '[]'::jsonb) END,
         h.created_at,
         (NOT _priv AND EXISTS (SELECT 1 FROM jsonb_array_elements(h.changes) e WHERE (e->>'sensitive')::boolean))
    FROM public.property_history h
   WHERE h.property_id = _property_id
     AND (_category IS NULL OR h.category = _category)
     AND (_before IS NULL OR (h.created_at, h.id) < (_before, coalesce(_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   ORDER BY h.created_at DESC, h.id DESC
   LIMIT least(greatest(coalesce(_limit, 20), 1), 50);
END $$;
REVOKE ALL ON FUNCTION public.property_history_list(uuid, timestamptz, uuid, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.property_history_list(uuid, timestamptz, uuid, text, int) TO authenticated;