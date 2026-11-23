-- Entrada de vistoria: marca de conferência do contrato anexado + vínculo vistoria<->contrato na criação.

-- 1) Conferência do documento do contrato (anexado e conferido libera a vistoria de entrada).
ALTER TABLE public.rental_contract_documents
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

-- 2) A ficha do documento hoje só podia ser inserida/lida/excluída; a conferência precisa
--    de UPDATE com exatamente a mesma regra de quem criou o contrato (ou administração).
CREATE POLICY "rental_docs_update" ON public.rental_contract_documents
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rental_contracts c
    WHERE c.id = rental_contract_documents.contract_id
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rental_contracts c
    WHERE c.id = rental_contract_documents.contract_id
      AND (c.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- 3) A criação da vistoria passa a gravar o contrato de origem e o tipo (entrada/saida).
--    Todo o restante do corpo permanece idêntico ao atual.
CREATE OR REPLACE FUNCTION public.inspection_create(p_inspection jsonb, p_rooms jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid:=(p_inspection->>'id')::uuid; existing inspections; r jsonb; room_id uuid; pos integer:=0;
BEGIN
  SELECT * INTO existing FROM inspections WHERE id=v_id;
  IF FOUND THEN
    IF existing.property_id<>(p_inspection->>'property_id')::uuid THEN RAISE EXCEPTION 'O rascunho pertence a outro imóvel' USING ERRCODE='22023'; END IF;
    IF existing.rental_contract_id IS DISTINCT FROM (p_inspection->>'rental_contract_id')::uuid THEN RAISE EXCEPTION 'O rascunho pertence a outro contrato' USING ERRCODE='22023'; END IF;
    RETURN jsonb_build_object('id',v_id,'reused',true);
  END IF;
  IF (p_inspection->>'rental_contract_id') IS NOT NULL AND (p_inspection->>'rental_kind') IS NULL THEN
    RAISE EXCEPTION 'Informe o tipo de vistoria do contrato' USING ERRCODE='22023';
  END IF;
  INSERT INTO inspections(id,property_id,agency,kind,responsible_id,responsible_name,created_by,inspected_at,participants,furnished,cleaning,keys,meters,property_snapshot,plan_confirmed,rental_contract_id,rental_kind)
    VALUES(v_id,(p_inspection->>'property_id')::uuid,p_inspection->>'agency',p_inspection->>'kind',(p_inspection->>'responsible_id')::uuid,p_inspection->>'responsible_name',auth.uid(),(p_inspection->>'inspected_at')::timestamptz,p_inspection->'participants',p_inspection->>'furnished',p_inspection->>'cleaning',p_inspection->'keys',p_inspection->'meters',p_inspection->'property_snapshot',(p_inspection->>'plan_confirmed')::boolean,(p_inspection->>'rental_contract_id')::uuid,p_inspection->>'rental_kind');
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
  IF NOT FOUND OR existing.property_id<>(p_inspection->>'property_id')::uuid THEN RAISE; END IF;
  RETURN jsonb_build_object('id',v_id,'reused',true);
END $function$;