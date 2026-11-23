ALTER TABLE public.inspections ADD COLUMN IF NOT EXISTS rental_property_id uuid REFERENCES public.rental_properties(id) ON DELETE RESTRICT;
ALTER TABLE public.inspections ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE public.inspections ADD CONSTRAINT inspections_one_property CHECK (num_nonnulls(property_id, rental_property_id) = 1) NOT VALID;
ALTER TABLE public.inspections VALIDATE CONSTRAINT inspections_one_property;
CREATE UNIQUE INDEX IF NOT EXISTS inspections_contract_entry_unique ON public.inspections(rental_contract_id) WHERE rental_kind = 'entrada';
CREATE INDEX IF NOT EXISTS inspections_rental_property_idx ON public.inspections(rental_property_id);

CREATE OR REPLACE FUNCTION public.inspection_create(p_inspection jsonb, p_rooms jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid:=(p_inspection->>'id')::uuid; existing inspections; r jsonb; room_id uuid; pos integer:=0;
BEGIN
  SELECT * INTO existing FROM inspections WHERE id=v_id;
  IF FOUND THEN
    IF existing.property_id IS DISTINCT FROM (p_inspection->>'property_id')::uuid
       OR existing.rental_property_id IS DISTINCT FROM (p_inspection->>'rental_property_id')::uuid THEN RAISE EXCEPTION 'O rascunho pertence a outro imóvel' USING ERRCODE='22023'; END IF;
    IF existing.rental_contract_id IS DISTINCT FROM (p_inspection->>'rental_contract_id')::uuid THEN RAISE EXCEPTION 'O rascunho pertence a outro contrato' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('id',v_id,'reused',true);
  END IF;
  IF (p_inspection->>'rental_contract_id') IS NOT NULL AND (p_inspection->>'rental_kind') IS NULL THEN
    RAISE EXCEPTION 'Informe o tipo de vistoria do contrato' USING ERRCODE='22023';
  END IF;
  IF (p_inspection->>'rental_property_id') IS NOT NULL AND (p_inspection->>'rental_contract_id') IS NULL THEN
    RAISE EXCEPTION 'Imóvel de aluguel só em vistoria de contrato' USING ERRCODE='22023';
  END IF;
  INSERT INTO inspections(id,property_id,rental_property_id,agency,kind,responsible_id,responsible_name,created_by,inspected_at,participants,furnished,cleaning,keys,meters,property_snapshot,plan_confirmed,rental_contract_id,rental_kind)
    VALUES(v_id,(p_inspection->>'property_id')::uuid,(p_inspection->>'rental_property_id')::uuid,p_inspection->>'agency',p_inspection->>'kind',(p_inspection->>'responsible_id')::uuid,p_inspection->>'responsible_name',auth.uid(),(p_inspection->>'inspected_at')::timestamptz,p_inspection->'participants',p_inspection->>'furnished',p_inspection->>'cleaning',p_inspection->'keys',p_inspection->'meters',p_inspection->'property_snapshot',(p_inspection->>'plan_confirmed')::boolean,(p_inspection->>'rental_contract_id')::uuid,p_inspection->>'rental_kind');
  FOR r IN SELECT value FROM jsonb_array_elements(p_rooms) LOOP
    INSERT INTO inspection_rooms(inspection_id,name,kind,position) VALUES(v_id,r->>'name',r->>'kind',pos) RETURNING id INTO room_id;
    INSERT INTO inspection_items(inspection_id,room_id,name,category,position)
      SELECT v_id,room_id,it->>'name',it->>'category',ord-1 FROM jsonb_array_elements(r->'items') WITH ORDINALITY x(it,ord);
    pos:=pos+1;
  END LOOP;
  UPDATE inspections SET plan_confirmed=(p_inspection->>'plan_confirmed')::boolean WHERE id=v_id;
  INSERT INTO inspection_events(inspection_id,event,details,actor_id) VALUES(v_id,'criada',jsonb_build_object('rooms',pos),auth.uid());
  RETURN jsonb_build_object('id',v_id,'reused',false);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO existing FROM inspections WHERE id=v_id;
  IF NOT FOUND OR existing.property_id IS DISTINCT FROM (p_inspection->>'property_id')::uuid
     OR existing.rental_property_id IS DISTINCT FROM (p_inspection->>'rental_property_id')::uuid THEN RAISE; END IF;
  RETURN jsonb_build_object('id',v_id,'reused',true);
END $function$;