-- Keep the parent rental's access boundary on the inspection and its existing
-- room, evidence, event and private storage policies.
CREATE POLICY inspections_rental_scope ON public.inspections AS RESTRICTIVE
  TO authenticated USING (
    rental_contract_id IS NULL OR public.rental_workflow_can_operate(rental_contract_id, false)
  ) WITH CHECK (
    rental_contract_id IS NULL OR public.rental_workflow_can_operate(rental_contract_id, false)
  );

CREATE OR REPLACE FUNCTION public.inspection_can_access(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_meta_reviewer() AND NOT public.is_atendimentos_viewer()
    AND EXISTS (
      SELECT 1 FROM public.inspections i WHERE i.id=p_id
        AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'secretaria')
          OR (public.has_role(auth.uid(),'corretor') AND (i.responsible_id=auth.uid() OR i.created_by=auth.uid())))
        AND (i.rental_contract_id IS NULL OR public.rental_workflow_can_operate(i.rental_contract_id,false))
    );
$$;

CREATE OR REPLACE FUNCTION public.rental_inspection_link_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.rental_contracts; revision text; entry_id uuid;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF (NEW.rental_contract_id, NEW.rental_kind, NEW.rental_property_id, NEW.entry_inspection_id)
      IS DISTINCT FROM (OLD.rental_contract_id, OLD.rental_kind, OLD.rental_property_id, OLD.entry_inspection_id)
      OR (OLD.rental_contract_id IS NOT NULL AND
        (NEW.kind,NEW.agency,NEW.property_id) IS DISTINCT FROM (OLD.kind,OLD.agency,OLD.property_id)) THEN
      RAISE EXCEPTION 'O vínculo da vistoria é definido na criação.' USING ERRCODE='22023';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.rental_contract_id IS NULL THEN
    IF num_nonnulls(NEW.rental_kind,NEW.rental_property_id,NEW.entry_inspection_id)<>0 THEN
      RAISE EXCEPTION 'Informe o aluguel da vistoria.' USING ERRCODE='22023';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO c FROM public.rental_contracts WHERE id=NEW.rental_contract_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rental_workflow_actor_allowed(NEW.created_by,c.brand::text,c.created_by)
    OR (auth.uid() IS NOT NULL AND NEW.created_by IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'Aluguel sem acesso.' USING ERRCODE='42501';
  END IF;
  IF NEW.rental_property_id IS DISTINCT FROM c.property_id OR NEW.property_id IS NOT NULL
    OR NEW.rental_kind IS NULL OR NEW.kind<>NEW.rental_kind
    OR (c.brand::text<>'ambas' AND NEW.agency<>c.brand::text)
    OR (NOT public.has_role(NEW.created_by,'admin') AND NOT public.has_notification_agency_access(NEW.created_by,NEW.agency)) THEN
    RAISE EXCEPTION 'Vistoria incompatível com o imóvel ou a imobiliária do aluguel.' USING ERRCODE='22023';
  END IF;
  IF NEW.rental_kind='entrada' THEN
    revision:=public.rental_contract_data_revision(c.id);
    IF NOT EXISTS (
      SELECT 1 FROM public.rental_contract_documents d WHERE d.contract_id=c.id
        AND d.category='contrato_aluguel' AND d.reviewed_at IS NOT NULL AND d.review_revision=revision
        AND (d.drive_file_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM storage.objects o WHERE o.bucket_id='rental-documents' AND o.name=d.file_path
        ))
    ) THEN RAISE EXCEPTION 'Confirme e salve o contrato antes de iniciar a vistoria.' USING ERRCODE='23514'; END IF;
    NEW.entry_inspection_id:=NULL;
  ELSE
    SELECT i.id INTO entry_id FROM public.inspections i
      JOIN public.inspection_documents d ON d.inspection_id=i.id AND d.version=i.current_version
      WHERE i.rental_contract_id=c.id AND i.rental_kind='entrada' AND i.status='concluida'
      FOR SHARE OF i;
    IF entry_id IS NULL THEN
      RAISE EXCEPTION 'Conclua a entrada com o termo registrado antes da saída.' USING ERRCODE='23514';
    END IF;
    NEW.entry_inspection_id:=entry_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rental_inspection_link_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER rental_inspection_link_guard BEFORE INSERT OR UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.rental_inspection_link_guard();

CREATE OR REPLACE FUNCTION public.inspection_reorder_rooms(p_id uuid,p_order uuid[])
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.inspection_can_edit(p_id) THEN RAISE EXCEPTION 'Sem acesso' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.inspections WHERE id=p_id FOR UPDATE;
  IF cardinality(p_order)<>(SELECT count(*) FROM public.inspection_rooms WHERE inspection_id=p_id)
    OR cardinality(p_order)<>(SELECT count(DISTINCT x) FROM unnest(p_order) x)
    OR EXISTS(SELECT 1 FROM unnest(p_order) x WHERE NOT EXISTS (
      SELECT 1 FROM public.inspection_rooms WHERE id=x AND inspection_id=p_id
    )) THEN RAISE EXCEPTION 'Lista de cômodos inválida.' USING ERRCODE='22023'; END IF;
  UPDATE public.inspection_rooms r SET position=o.pos-1 FROM unnest(p_order) WITH ORDINALITY o(id,pos)
    WHERE r.id=o.id AND r.inspection_id=p_id AND r.position<>o.pos-1;
END $$;
REVOKE ALL ON FUNCTION public.inspection_reorder_rooms(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inspection_reorder_rooms(uuid,uuid[]) TO authenticated, service_role;
