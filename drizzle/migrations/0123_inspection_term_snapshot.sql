-- Fields entered by the inspector, covered by the existing RLS and root revision.
ALTER TABLE public.inspections
  ADD COLUMN term_conditions jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(term_conditions) = 'object'),
  ADD COLUMN term_purpose text CHECK (term_purpose IN ('residencial','comercial')),
  ADD COLUMN term_city text,
  ADD COLUMN term_address text;
ALTER TABLE public.inspection_media
  ADD COLUMN meter text CHECK (meter IN ('agua','luz','gas'));
--> statement-breakpoint
-- The same snapshot is compared again and archived by inspection_finalize.
-- Keep party details inside the existing inspection + rental access boundary.
CREATE OR REPLACE FUNCTION public.inspection_snapshot(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v inspections; rental jsonb;
BEGIN
  IF public.is_atendimentos_viewer() OR public.is_meta_reviewer() THEN
    RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501';
  END IF;
  IF NOT inspection_can_access(p_id) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE = '42501'; END IF;
  SELECT * INTO STRICT v FROM inspections WHERE id=p_id FOR UPDATE;
  IF v.rental_contract_id IS NOT NULL THEN
    IF NOT rental_workflow_can_operate(v.rental_contract_id, false) THEN
      RAISE EXCEPTION 'Aluguel sem acesso' USING ERRCODE='42501';
    END IF;
    SELECT jsonb_build_object(
      'id',c.id,'propertyId',p.id,'brand',c.brand,'modelBrand',c.template_options->>'modelBrand',
      'owners',jsonb_build_array(jsonb_build_object('name',p.proprietario_nome,'document',p.proprietario_cpf,
        'details',c.template_options->'owner')),
      'tenants',COALESCE((
        SELECT jsonb_agg(jsonb_build_object('name',t.nome,'document',t.cpf_cnpj,'address',t.endereco,
          'profession',t.profissao,'details',c.template_options->'tenants'->ranked.idx) ORDER BY ranked.idx)
        FROM (
          SELECT tenant_id,(row_number() OVER (ORDER BY is_primary DESC,position,id)-1)::int AS idx
            FROM rental_contract_tenants WHERE contract_id=c.id
          UNION ALL SELECT c.tenant_id,0 WHERE NOT EXISTS (
            SELECT 1 FROM rental_contract_tenants WHERE contract_id=c.id)
        ) ranked JOIN rental_tenants t ON t.id=ranked.tenant_id
      ),'[]'::jsonb)
    ) INTO rental FROM rental_contracts c JOIN rental_properties p ON p.id=c.property_id
      WHERE c.id=v.rental_contract_id;
  END IF;
  RETURN jsonb_build_object('inspection',to_jsonb(v),'termRental',rental,'termRevision',md5(rental::text),
    'rooms',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY position,id) FROM inspection_rooms r WHERE inspection_id=p_id),'[]'::jsonb),
    'items',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY room_id,position,id) FROM inspection_items i WHERE inspection_id=p_id),'[]'::jsonb),
    'media',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY room_id,position,created_at,id) FROM inspection_media m WHERE inspection_id=p_id),'[]'::jsonb),
    'notes',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY created_at,id) FROM inspection_notes n WHERE inspection_id=p_id),'[]'::jsonb));
END $$;
--> statement-breakpoint
-- Rental rows may change without taking the inspection lock. Persist exactly
-- the snapshot just compared with the database, including the original parties.
DO $$
DECLARE fn text := pg_get_functiondef('public.inspection_finalize(uuid,integer,text,integer,text,jsonb)'::regprocedure);
  before_insert text := 'p_sha256, public.inspection_snapshot(p_id), auth.uid()';
BEGIN
  IF strpos(fn,before_insert)=0 OR strpos(fn,'p_snapshot IS DISTINCT FROM public.inspection_snapshot(p_id)')=0 THEN
    RAISE EXCEPTION 'Definição inesperada de inspection_finalize';
  END IF;
  EXECUTE replace(fn,before_insert,'p_sha256, p_snapshot, auth.uid()');
END $$;
