-- Importação: nenhuma observação pode ultrapassar a revisão local ou trocar a
-- identidade/versão da publicação, mesmo quando não há patch no imóvel.
-- Mantém a assinatura usada pelo worker para permitir aplicação incremental.
CREATE OR REPLACE FUNCTION public.property_remote_merge(
  _property_id uuid,
  _expected_revision integer,
  _patch jsonb,
  _publication_id uuid,
  _publication_fields jsonb,
  _conflicts jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  property_revision integer;
  publication_row public.property_provider_publications%ROWTYPE;
  other_row public.property_provider_publications%ROWTYPE;
  guard jsonb := _publication_fields->'__guard';
  sets text;
  pub_sets text;
  c jsonb;
  pending_total integer;
  new_revision integer;
  updated_rows integer;
BEGIN
  IF _expected_revision IS NULL OR guard IS NULL
     OR nullif(guard->>'provider', '') IS NULL
     OR nullif(guard->>'external_property_id', '') IS NULL
     OR nullif(guard->>'publication_updated_at', '') IS NULL THEN
    RAISE EXCEPTION 'import_guard_missing' USING ERRCODE = 'P0001';
  END IF;

  SELECT revision INTO property_revision
    FROM public.properties WHERE id = _property_id FOR UPDATE;
  IF NOT FOUND OR property_revision IS DISTINCT FROM _expected_revision THEN
    RAISE EXCEPTION 'revision_changed' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO publication_row
    FROM public.property_provider_publications
   WHERE id = _publication_id FOR UPDATE;
  IF NOT FOUND OR publication_row.property_id <> _property_id
     OR publication_row.provider::text <> guard->>'provider'
     OR publication_row.external_property_id IS DISTINCT FROM guard->>'external_property_id'
     OR publication_row.updated_at IS DISTINCT FROM (guard->>'publication_updated_at')::timestamptz THEN
    RAISE EXCEPTION 'publication_changed' USING ERRCODE = 'P0001';
  END IF;

  IF nullif(guard->>'other_publication_id', '') IS NOT NULL THEN
    SELECT * INTO other_row FROM public.property_provider_publications
     WHERE id = (guard->>'other_publication_id')::uuid FOR UPDATE;
    IF NOT FOUND OR other_row.property_id <> _property_id
       OR other_row.provider = publication_row.provider
       OR other_row.updated_at IS DISTINCT FROM (guard->>'other_publication_updated_at')::timestamptz THEN
      RAISE EXCEPTION 'other_publication_changed' USING ERRCODE = 'P0001';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.property_provider_publications p
     WHERE p.property_id = _property_id AND p.provider <> publication_row.provider
  ) THEN
    RAISE EXCEPTION 'other_publication_changed' USING ERRCODE = 'P0001';
  END IF;

  -- A função só aceita campos importáveis; identificadores, vínculo e
  -- disponibilidade não podem ser alterados por um payload remoto.
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(_patch, '{}'::jsonb)) k
     WHERE k <> ALL (ARRAY[
       'operacao','finalidade','tipo','bairro','cidade','uf','cep','logradouro',
       'numero','complemento','valor','valor_condominio','valor_iptu',
       'dormitorios','suites','banheiros','salas','vagas','acomodacoes',
       'ano_construcao','area_privativa','area_total','area_terreno',
       'area_construida','area_principal','area_tipo','descricao_imovel'
     ])
  ) THEN
    RAISE EXCEPTION 'import_field_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(format('%I = r.%I', k, k), ', ')
    INTO sets FROM jsonb_object_keys(coalesce(_patch, '{}'::jsonb)) k;
  new_revision := property_revision;
  IF sets IS NOT NULL THEN
    EXECUTE format(
      'UPDATE public.properties p SET %s, revision = p.revision + 1
         FROM jsonb_populate_record(NULL::public.properties, $1) r
        WHERE p.id = $2 RETURNING p.revision', sets)
      INTO new_revision USING _patch, _property_id;
    IF new_revision IS NULL THEN
      RAISE EXCEPTION 'revision_changed' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(_conflicts, '[]'::jsonb)) LOOP
    IF c->>'provider' IS DISTINCT FROM publication_row.provider::text THEN
      RAISE EXCEPTION 'conflict_provider_mismatch' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.property_field_conflicts f
       SET confirmed_value = c->'confirmed_value', local_value = c->'local_value',
           remote_value = c->'remote_value', applied_value = c->'applied_value',
           classification = c->>'classification', detected_revision = new_revision,
           publication_id = _publication_id, updated_at = now()
     WHERE f.property_id = _property_id AND f.provider = publication_row.provider
       AND f.field = c->>'field' AND f.scope = c->>'scope' AND f.resolution = 'pending';
    IF NOT FOUND THEN
      INSERT INTO public.property_field_conflicts
        (property_id, provider, publication_id, field, scope, classification, resolution,
         confirmed_value, local_value, remote_value, applied_value, detected_revision)
      VALUES (_property_id, publication_row.provider, _publication_id, c->>'field', c->>'scope',
              c->>'classification', 'pending', c->'confirmed_value', c->'local_value',
              c->'remote_value', c->'applied_value', new_revision);
    END IF;
  END LOOP;

  -- Uma decisão tomada pela edição normal no Gestão deixa de ser exceção
  -- quando o valor observado na conta coincide com o valor local. Para campo
  -- comum às duas contas, a outra também precisa estar confirmada.
  UPDATE public.property_field_conflicts f
     SET resolution = 'converged', resolved_at = now()
    FROM public.properties p
   WHERE p.id = _property_id AND f.property_id = _property_id
     AND f.publication_id = _publication_id AND f.resolution = 'pending'
     AND (_publication_fields->'remote_field_snapshot') ? f.field
     AND to_jsonb(p)->f.field = _publication_fields->'remote_field_snapshot'->f.field
     AND (f.scope <> 'cross_account' OR (
       other_row.id IS NOT NULL
       AND other_row.remote_field_snapshot ? f.field
       AND other_row.remote_field_snapshot->f.field = to_jsonb(p)->f.field
     ));

  SELECT count(*) INTO pending_total FROM public.property_field_conflicts
   WHERE property_id = _property_id AND publication_id = _publication_id AND resolution = 'pending';

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(_publication_fields, '{}'::jsonb)) k
     WHERE k <> ALL (ARRAY[
       '__guard','remote_field_snapshot','remote_snapshot_at','remote_observed_hash',
       'confirmed_field_snapshot','last_published_hash','baseline_at',
       'last_imported_at','last_verified_at','last_error_category',
       'last_error_message','remote_read_state','external_public_url','import_run_id'
     ])
  ) THEN
    RAISE EXCEPTION 'publication_field_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  SELECT string_agg(format('%I = r.%I', k, k), ', ')
    INTO pub_sets FROM jsonb_object_keys(coalesce(_publication_fields, '{}'::jsonb)) k
   WHERE k <> '__guard';
  EXECUTE format(
    'UPDATE public.property_provider_publications p SET %s conflict_count = $3
       FROM jsonb_populate_record(NULL::public.property_provider_publications, $1) r
      WHERE p.id = $2',
    CASE WHEN pub_sets IS NULL THEN '' ELSE pub_sets || ',' END)
    USING _publication_fields - '__guard', _publication_id, pending_total;
  GET DIAGNOSTICS updated_rows = ROW_COUNT;
  IF updated_rows <> 1 THEN
    RAISE EXCEPTION 'publication_changed' USING ERRCODE = 'P0001';
  END IF;
  RETURN new_revision;
END;
$function$;

REVOKE ALL ON FUNCTION public.property_remote_merge(uuid, integer, jsonb, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.property_remote_merge(uuid, integer, jsonb, uuid, jsonb, jsonb)
  TO service_role;
