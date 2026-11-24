ALTER TABLE public.rental_contracts
  ADD COLUMN IF NOT EXISTS template_options jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.rental_contract_documents
  ADD COLUMN IF NOT EXISTS source_revision text,
  ADD COLUMN IF NOT EXISTS review_revision text;

CREATE TABLE IF NOT EXISTS public.rental_workspace_drafts (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand public.rental_brand NOT NULL,
  input jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_workspace_drafts_owner_idx
  ON public.rental_workspace_drafts(created_by, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.rental_workspace_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.rental_workspace_drafts(id) ON DELETE CASCADE,
  draft_revision integer NOT NULL,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  category text NOT NULL CHECK (category IN ('contrato_aluguel','termo_vistoria','checklist_aluguel','apolice_seguro_fianca','outro')),
  origin text NOT NULL CHECK (origin IN ('externo','gerado')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rental_workspace_files_draft_idx ON public.rental_workspace_files(draft_id);

CREATE OR REPLACE FUNCTION public.rental_workflow_actor_allowed(p_actor uuid, p_brand text, p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(p_actor IS NOT NULL
    AND NOT public.has_role(p_actor, 'meta_reviewer')
    AND NOT public.has_role(p_actor, 'atendimentos_viewer')
    AND (public.has_role(p_actor, 'admin') OR (
      p_actor = p_owner
      AND (public.has_role(p_actor, 'secretaria') OR public.has_role(p_actor, 'corretor'))
      AND public.has_notification_agency_access(p_actor, p_brand)
    )), false);
$$;
REVOKE ALL ON FUNCTION public.rental_workflow_actor_allowed(uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rental_workflow_actor_allowed(uuid,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rental_workflow_can_operate(p_id uuid, p_draft boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN p_draft THEN EXISTS (
    SELECT 1 FROM public.rental_workspace_drafts d WHERE d.id = p_id AND d.created_by = auth.uid()
    AND public.rental_workflow_actor_allowed(auth.uid(), d.brand::text, d.created_by)
  ) ELSE EXISTS (
    SELECT 1 FROM public.rental_contracts c WHERE c.id = p_id
    AND public.rental_workflow_actor_allowed(auth.uid(), c.brand::text, c.created_by)
  ) END;
$$;
REVOKE ALL ON FUNCTION public.rental_workflow_can_operate(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_workflow_can_operate(uuid,boolean) TO authenticated, service_role;

ALTER TABLE public.rental_workspace_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_workspace_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_workspace_drafts, public.rental_workspace_files FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rental_workspace_drafts, public.rental_workspace_files TO authenticated;
GRANT ALL ON public.rental_workspace_drafts, public.rental_workspace_files TO service_role;
CREATE POLICY rental_workspace_drafts_read ON public.rental_workspace_drafts
  FOR SELECT TO authenticated USING (public.rental_workflow_can_operate(id, true));
CREATE POLICY rental_workspace_files_read ON public.rental_workspace_files
  FOR SELECT TO authenticated USING (public.rental_workflow_can_operate(draft_id, true));
CREATE POLICY meta_reviewer_block ON public.rental_workspace_drafts AS RESTRICTIVE
  TO authenticated USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY meta_reviewer_block ON public.rental_workspace_files AS RESTRICTIVE
  TO authenticated USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public.rental_workspace_drafts AS RESTRICTIVE
  TO authenticated USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());
CREATE POLICY atendimentos_viewer_block ON public.rental_workspace_files AS RESTRICTIVE
  TO authenticated USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());

CREATE POLICY rental_workspace_storage_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'rental-documents' AND public.rental_workflow_can_operate(public._try_uuid(split_part(name, '/', 1)), true));
CREATE POLICY rental_workspace_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rental-documents' AND public.rental_workflow_can_operate(public._try_uuid(split_part(name, '/', 1)), true));

-- The fingerprint covers the terms and parties, outside the payment/Drive lifecycle.
CREATE OR REPLACE FUNCTION public.rental_contract_data_revision(p_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(jsonb_build_array(
    jsonb_build_array(c.brand, c.property_id, c.tenant_id, c.guarantor_id, c.valor_mensal,
      c.valor_caucao, c.garantia_tipo, c.seguro_seguradora, c.seguro_apolice, c.seguro_valor_mensal,
      c.data_inicio, c.data_fim, c.dia_vencimento, c.template_options),
    jsonb_build_array(p.tipo, p.logradouro, p.numero, p.complemento, p.bairro, p.cidade, p.uf, p.cep,
      p.proprietario_nome, p.proprietario_cpf),
    (SELECT jsonb_agg(jsonb_build_array(t.id,t.nome,t.cpf_cnpj,t.endereco,t.profissao)
      ORDER BY coalesce(j.is_primary, true) DESC, coalesce(j.position, 0), t.id)
      FROM public.rental_tenants t LEFT JOIN public.rental_contract_tenants j
        ON j.tenant_id = t.id AND j.contract_id = c.id
      WHERE j.id IS NOT NULL OR (t.id = c.tenant_id AND NOT EXISTS (
        SELECT 1 FROM public.rental_contract_tenants WHERE contract_id = c.id))),
    (SELECT jsonb_build_array(g.nome,g.cpf_cnpj,g.endereco,g.profissao)
      FROM public.rental_guarantors g WHERE g.id = c.guarantor_id),
    (SELECT jsonb_agg(jsonb_build_array(j.tipo,j.valor_caucao,j.seguro_seguradora,j.seguro_apolice,
        j.seguro_valor_mensal,j.conjuge,j.guarantor_id,g.nome,g.cpf_cnpj,g.endereco,g.profissao)
      ORDER BY j.is_primary DESC,j.position,j.id)
      FROM public.rental_contract_guarantors j LEFT JOIN public.rental_guarantors g ON g.id=j.guarantor_id
      WHERE j.contract_id=c.id)
  )::text, 'UTF8')), 'hex')
  FROM public.rental_contracts c JOIN public.rental_properties p ON p.id=c.property_id
  WHERE c.id=p_id;
$$;
REVOKE ALL ON FUNCTION public.rental_contract_data_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rental_contract_data_revision(uuid) TO authenticated, service_role;

UPDATE public.rental_contract_documents d SET review_revision=public.rental_contract_data_revision(d.contract_id)
  WHERE d.category='contrato_aluguel' AND d.reviewed_at IS NOT NULL AND d.review_revision IS NULL;

CREATE OR REPLACE FUNCTION public.rental_protect_workflow_document()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP='INSERT' THEN
      IF NEW.reviewed_at IS NOT NULL OR NEW.reviewed_by IS NOT NULL OR NEW.review_revision IS NOT NULL
        OR NEW.source_revision IS NOT NULL OR NEW.origin <> 'externo' THEN
        RAISE EXCEPTION 'Registro de versão e conferência exigem o servidor.' USING ERRCODE='42501';
      END IF;
    ELSIF (NEW.reviewed_at,NEW.reviewed_by,NEW.review_revision,NEW.source_revision,NEW.origin,
        NEW.contract_id,NEW.file_path,NEW.category)
      IS DISTINCT FROM (OLD.reviewed_at,OLD.reviewed_by,OLD.review_revision,OLD.source_revision,OLD.origin,
        OLD.contract_id,OLD.file_path,OLD.category) THEN
      RAISE EXCEPTION 'Registro de versão e conferência exigem o servidor.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rental_protect_workflow_document BEFORE INSERT OR UPDATE ON public.rental_contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.rental_protect_workflow_document();

CREATE OR REPLACE FUNCTION public.rental_save_workspace_draft(p_actor uuid, p_id uuid, p_revision integer, p_input jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d public.rental_workspace_drafts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  IF NOT public.rental_workflow_actor_allowed(p_actor, p_input->>'brand', p_actor)
    OR (p_input->>'brand'='ambas' AND p_input->'template'->>'modelBrand' IS NOT NULL
      AND NOT public.rental_workflow_actor_allowed(p_actor,p_input->'template'->>'modelBrand',p_actor)) THEN
    RAISE EXCEPTION 'Sem acesso a esta imobiliária.' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rental_contracts WHERE id=p_id) THEN
    RAISE EXCEPTION 'Aluguel já cadastrado. Reabra a ficha.' USING ERRCODE='40001';
  END IF;
  SELECT * INTO d FROM public.rental_workspace_drafts WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF d.created_by <> p_actor OR NOT public.rental_workflow_actor_allowed(p_actor, d.brand::text, d.created_by) THEN
      RAISE EXCEPTION 'Rascunho sem acesso.' USING ERRCODE='42501';
    END IF;
    IF d.input = p_input THEN RETURN d.revision; END IF;
    IF d.revision <> p_revision THEN
      RAISE EXCEPTION 'O rascunho mudou em outra tela. Reabra para revisar os dados.' USING ERRCODE='40001';
    END IF;
    UPDATE public.rental_workspace_drafts SET input=p_input, brand=(p_input->>'brand')::public.rental_brand,
      revision=revision+1, updated_at=now() WHERE id=p_id RETURNING revision INTO p_revision;
  ELSE
    IF p_revision <> 0 THEN RAISE EXCEPTION 'Rascunho não encontrado.' USING ERRCODE='40001'; END IF;
    INSERT INTO public.rental_workspace_drafts(id,created_by,brand,input)
      VALUES (p_id,p_actor,(p_input->>'brand')::public.rental_brand,p_input) RETURNING revision INTO p_revision;
  END IF;
  RETURN p_revision;
END $$;

CREATE OR REPLACE FUNCTION public.rental_register_workflow_file(
  p_actor uuid, p_id uuid, p_revision text, p_draft boolean, p_file jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d public.rental_workspace_drafts; c public.rental_contracts;
  staged public.rental_workspace_files; doc public.rental_contract_documents;
  path text := p_file->>'filePath'; file_origin text := p_file->>'origin';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  IF split_part(path, '/', 1) IS DISTINCT FROM p_id::text
    OR split_part(path, '/', 2) = '' OR split_part(path, '/', 3) <> ''
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='rental-documents' AND name=path) THEN
    RAISE EXCEPTION 'Arquivo não encontrado no armazenamento do aluguel.' USING ERRCODE='22023';
  END IF;
  IF p_draft THEN
    SELECT * INTO d FROM public.rental_workspace_drafts WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR d.created_by <> p_actor OR NOT public.rental_workflow_actor_allowed(p_actor,d.brand::text,d.created_by) THEN
      RAISE EXCEPTION 'Rascunho sem acesso.' USING ERRCODE='42501';
    END IF;
    IF d.revision::text <> p_revision THEN RAISE EXCEPTION 'O rascunho mudou. Abra uma nova prévia.' USING ERRCODE='40001'; END IF;
    INSERT INTO public.rental_workspace_files(draft_id,draft_revision,file_path,file_name,mime_type,size_bytes,category,origin)
      VALUES (p_id,d.revision,path,p_file->>'fileName',p_file->>'mimeType',(p_file->>'sizeBytes')::bigint,p_file->>'category',file_origin)
      ON CONFLICT (file_path) DO NOTHING;
    SELECT * INTO staged FROM public.rental_workspace_files WHERE file_path=path AND draft_id=p_id;
    IF NOT FOUND OR (staged.origin='gerado' AND staged.draft_revision<>d.revision) THEN
      RAISE EXCEPTION 'A versão do arquivo não pertence à revisão atual.' USING ERRCODE='40001';
    END IF;
    RETURN jsonb_build_object('id',staged.id);
  END IF;

  SELECT * INTO c FROM public.rental_contracts WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rental_workflow_actor_allowed(p_actor,c.brand::text,c.created_by) THEN
    RAISE EXCEPTION 'Aluguel sem acesso.' USING ERRCODE='42501';
  END IF;
  IF file_origin='gerado' AND p_revision IS DISTINCT FROM public.rental_contract_data_revision(p_id) THEN
    RAISE EXCEPTION 'O aluguel mudou. Abra uma nova prévia.' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.rental_contract_documents(contract_id,file_path,file_name,mime_type,size_bytes,category,uploaded_by,origin,source_revision)
    VALUES (p_id,path,p_file->>'fileName',p_file->>'mimeType',(p_file->>'sizeBytes')::bigint,
      p_file->>'category',p_actor,file_origin,CASE WHEN file_origin='gerado' THEN p_revision END)
    ON CONFLICT (file_path) DO NOTHING;
  SELECT * INTO doc FROM public.rental_contract_documents WHERE file_path=path AND contract_id=p_id;
  IF NOT FOUND OR doc.origin<>file_origin OR (file_origin='gerado' AND doc.source_revision IS DISTINCT FROM p_revision) THEN
    RAISE EXCEPTION 'A versão do arquivo não pertence à revisão atual.' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object('id',doc.id);
END $$;

-- Payloads are normalized server-side. This transaction is the only transition
-- from a workspace draft to a rental and its ordinary documents.
CREATE OR REPLACE FUNCTION public.rental_confirm_workflow_file(
  p_actor uuid, p_id uuid, p_document uuid, p_revision text, p_reviewed boolean,
  p_materialize jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE d public.rental_workspace_drafts; c public.rental_contracts; staged public.rental_workspace_files;
  doc public.rental_contract_documents; p public.rental_properties; t public.rental_tenants;
  g public.rental_guarantors; entry jsonb; rev text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  SELECT * INTO c FROM public.rental_contracts WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO d FROM public.rental_workspace_drafts WHERE id=p_id FOR UPDATE;
    IF NOT FOUND OR d.created_by<>p_actor OR NOT public.rental_workflow_actor_allowed(p_actor,d.brand::text,d.created_by) THEN
      RAISE EXCEPTION 'Rascunho sem acesso.' USING ERRCODE='42501';
    END IF;
    IF NOT p_reviewed OR p_materialize IS NULL OR d.revision::text IS DISTINCT FROM p_revision THEN
      RAISE EXCEPTION 'Salve a revisão atual antes de conferir.' USING ERRCODE='40001';
    END IF;
    SELECT * INTO staged FROM public.rental_workspace_files WHERE id=p_document AND draft_id=p_id;
    IF NOT FOUND OR staged.category<>'contrato_aluguel'
      OR (staged.origin='gerado' AND staged.draft_revision<>d.revision)
      OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='rental-documents' AND name=staged.file_path) THEN
      RAISE EXCEPTION 'O contrato desta revisão ainda não foi registrado.' USING ERRCODE='22023';
    END IF;

    p := jsonb_populate_record(NULL::public.rental_properties, p_materialize->'property');
    IF p.id IS NULL THEN p.id := gen_random_uuid(); END IF;
    IF EXISTS (SELECT 1 FROM public.rental_properties WHERE id=p.id) THEN
      IF NOT EXISTS (SELECT 1 FROM public.rental_properties WHERE id=p.id
        AND public.rental_workflow_actor_allowed(p_actor,brand::text,created_by)) THEN
        RAISE EXCEPTION 'Imóvel sem acesso.' USING ERRCODE='42501';
      END IF;
      PERFORM 1 FROM public.rental_properties WHERE id=p.id FOR UPDATE;
      UPDATE public.rental_properties SET (apelido,tipo,logradouro,numero,complemento,bairro,cidade,uf,cep,
        quartos,banheiros,vagas,area_m2,proprietario_nome,proprietario_cpf,proprietario_email,proprietario_telefone)
        = (p.apelido,p.tipo,p.logradouro,p.numero,p.complemento,p.bairro,p.cidade,p.uf,p.cep,
          p.quartos,p.banheiros,p.vagas,p.area_m2,p.proprietario_nome,p.proprietario_cpf,p.proprietario_email,p.proprietario_telefone)
        WHERE id=p.id;
    ELSE
      IF (p_materialize->'property'->>'id') IS NOT NULL THEN
        RAISE EXCEPTION 'Imóvel não encontrado.' USING ERRCODE='22023';
      END IF;
      p.created_by:=p_actor; p.created_at:=now(); p.updated_at:=now(); p.brand:=d.brand;
      INSERT INTO public.rental_properties SELECT (p).*;
    END IF;
    IF EXISTS (SELECT 1 FROM public.rental_contracts WHERE property_id=p.id AND status IN ('ativo','pendente_assinatura')) THEN
      RAISE EXCEPTION 'Este imóvel já possui um contrato ativo ou pendente.' USING ERRCODE='23505';
    END IF;

    c := jsonb_populate_record(NULL::public.rental_contracts, p_materialize->'contract');
    c.id:=p_id; c.created_by:=p_actor; c.property_id:=p.id; c.brand:=d.brand;
    c.created_at:=now(); c.updated_at:=now();
    c.tenant_id:=NULL; c.guarantor_id:=NULL;
    -- Primary pointers are needed before the join rows can use the rental FK.
    FOR entry IN SELECT value FROM jsonb_array_elements(p_materialize->'tenants') LOOP
      t := jsonb_populate_record(NULL::public.rental_tenants, entry);
      IF t.id IS NOT NULL THEN
        UPDATE public.rental_tenants SET (nome,cpf_cnpj,telefone,email,data_nascimento,endereco,profissao,renda_aproximada,observacoes)
          = (t.nome,t.cpf_cnpj,t.telefone,t.email,t.data_nascimento,t.endereco,t.profissao,t.renda_aproximada,t.observacoes)
          WHERE id=t.id AND (created_by=p_actor OR public.has_role(p_actor,'admin'));
        IF NOT FOUND THEN RAISE EXCEPTION 'Locatário sem acesso.' USING ERRCODE='42501'; END IF;
      ELSE
        t.id:=gen_random_uuid(); t.created_by:=p_actor; t.created_at:=now(); t.updated_at:=now();
        INSERT INTO public.rental_tenants SELECT (t).*;
      END IF;
      p_materialize := jsonb_set(p_materialize, '{tenant_ids}', coalesce(p_materialize->'tenant_ids','[]'::jsonb) || to_jsonb(t.id));
      c.tenant_id:=coalesce(c.tenant_id,t.id);
    END LOOP;
    FOR entry IN SELECT value FROM jsonb_array_elements(p_materialize->'guarantees') LOOP
      g := jsonb_populate_record(NULL::public.rental_guarantors, entry->'person');
      IF entry->>'tipo'='fiador' THEN
        IF g.id IS NOT NULL THEN
          UPDATE public.rental_guarantors SET (nome,cpf_cnpj,telefone,email,endereco,profissao,vinculo,observacoes)
            = (g.nome,g.cpf_cnpj,g.telefone,g.email,g.endereco,g.profissao,g.vinculo,g.observacoes)
            WHERE id=g.id AND (created_by=p_actor OR public.has_role(p_actor,'admin'));
          IF NOT FOUND THEN RAISE EXCEPTION 'Fiador sem acesso.' USING ERRCODE='42501'; END IF;
        ELSE
          g.id:=gen_random_uuid(); g.created_by:=p_actor; g.created_at:=now(); g.updated_at:=now();
          INSERT INTO public.rental_guarantors SELECT (g).*;
        END IF;
      END IF;
      IF NOT (p_materialize ? 'guarantor_ids') THEN c.guarantor_id:=g.id; END IF;
      p_materialize := jsonb_set(p_materialize, '{guarantor_ids}',
        coalesce(p_materialize->'guarantor_ids','[]'::jsonb) || jsonb_build_array(g.id));
    END LOOP;
    INSERT INTO public.rental_contracts SELECT (c).*;
    INSERT INTO public.rental_contract_tenants(contract_id,tenant_id,is_primary,position)
      SELECT p_id,tenant_id::uuid,ord=1,ord-1
      FROM jsonb_array_elements_text(p_materialize->'tenant_ids') WITH ORDINALITY tenants(tenant_id,ord);
    INSERT INTO public.rental_contract_guarantors(contract_id,guarantor_id,tipo,valor_caucao,
      seguro_seguradora,seguro_apolice,seguro_valor_mensal,conjuge,is_primary,position)
      SELECT p_id,(p_materialize->'guarantor_ids'->>(ord::integer-1))::uuid,(v->>'tipo')::public.rental_guarantee_type,
        (v->>'valor_caucao')::numeric,v->>'seguro_seguradora',v->>'seguro_apolice',
        (v->>'seguro_valor_mensal')::numeric,nullif(v->'conjuge','null'::jsonb),ord=1,ord-1
      FROM jsonb_array_elements(p_materialize->'guarantees') WITH ORDINALITY guarantees(v,ord);
    rev:=public.rental_contract_data_revision(p_id);
    INSERT INTO public.rental_contract_documents(id,contract_id,file_path,file_name,mime_type,size_bytes,
      category,uploaded_by,created_at,origin,source_revision)
      SELECT id,p_id,file_path,file_name,mime_type,size_bytes,category,p_actor,created_at,origin,
        CASE WHEN origin='gerado' THEN CASE WHEN draft_revision=d.revision THEN rev
          ELSE 'draft:' || draft_revision::text END END
      FROM public.rental_workspace_files WHERE draft_id=p_id;
    DELETE FROM public.rental_workspace_drafts WHERE id=p_id;
  ELSE
    IF NOT public.rental_workflow_actor_allowed(p_actor,c.brand::text,c.created_by) THEN
      RAISE EXCEPTION 'Aluguel sem acesso.' USING ERRCODE='42501';
    END IF;
    rev:=public.rental_contract_data_revision(p_id);
  END IF;

  SELECT * INTO doc FROM public.rental_contract_documents WHERE id=p_document AND contract_id=p_id FOR UPDATE;
  IF NOT FOUND OR doc.category<>'contrato_aluguel' THEN
    RAISE EXCEPTION 'Documento do contrato não encontrado.' USING ERRCODE='22023';
  END IF;
  IF p_reviewed THEN
    -- A response lost after commit may be retried with the old draft revision.
    IF doc.reviewed_at IS NOT NULL AND doc.review_revision=rev THEN
      RETURN jsonb_build_object('id',doc.id,'contractId',p_id,'reviewedAt',doc.reviewed_at);
    END IF;
    IF (d.id IS NULL AND p_revision IS DISTINCT FROM rev)
      OR (doc.origin='gerado' AND doc.source_revision IS DISTINCT FROM rev) THEN
      RAISE EXCEPTION 'O aluguel mudou. Gere a versão atual antes de conferir.' USING ERRCODE='40001';
    END IF;
    IF doc.drive_file_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM storage.objects WHERE bucket_id='rental-documents' AND name=doc.file_path
    ) THEN RAISE EXCEPTION 'Arquivo indisponível no armazenamento.' USING ERRCODE='22023'; END IF;
  END IF;
  UPDATE public.rental_contract_documents SET
    reviewed_at=CASE WHEN p_reviewed THEN now() END,
    reviewed_by=CASE WHEN p_reviewed THEN p_actor END,
    review_revision=CASE WHEN p_reviewed THEN rev END
    WHERE id=p_document RETURNING * INTO doc;
  RETURN jsonb_build_object('id',doc.id,'contractId',p_id,'reviewedAt',doc.reviewed_at);
END $$;

REVOKE ALL ON FUNCTION public.rental_save_workspace_draft(uuid,uuid,integer,jsonb),
  public.rental_register_workflow_file(uuid,uuid,text,boolean,jsonb),
  public.rental_confirm_workflow_file(uuid,uuid,uuid,text,boolean,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rental_save_workspace_draft(uuid,uuid,integer,jsonb),
  public.rental_register_workflow_file(uuid,uuid,text,boolean,jsonb),
  public.rental_confirm_workflow_file(uuid,uuid,uuid,text,boolean,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.rental_save_template_options(p_actor uuid,p_id uuid,p_revision text,p_options jsonb)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE c public.rental_contracts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  SELECT * INTO c FROM public.rental_contracts WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR NOT public.rental_workflow_actor_allowed(p_actor,c.brand::text,c.created_by) THEN
    RAISE EXCEPTION 'Aluguel sem acesso.' USING ERRCODE='42501';
  END IF;
  IF c.brand::text='ambas' AND p_options->>'modelBrand' IS NOT NULL
    AND NOT public.rental_workflow_actor_allowed(p_actor,p_options->>'modelBrand',c.created_by) THEN
    RAISE EXCEPTION 'Sem acesso a esta imobiliária.' USING ERRCODE='42501';
  END IF;
  IF p_revision IS DISTINCT FROM public.rental_contract_data_revision(p_id) THEN
    RAISE EXCEPTION 'O aluguel mudou em outra tela. Reabra a ficha.' USING ERRCODE='40001';
  END IF;
  IF c.template_options IS DISTINCT FROM p_options THEN
    UPDATE public.rental_contracts SET template_options=p_options WHERE id=p_id;
  END IF;
  RETURN public.rental_contract_data_revision(p_id);
END $$;
REVOKE ALL ON FUNCTION public.rental_save_template_options(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rental_save_template_options(uuid,uuid,text,jsonb) TO service_role;

-- The prior owner/admin policies still apply in addition to the user's brand.
CREATE POLICY rental_contracts_workflow_agency ON public.rental_contracts AS RESTRICTIVE
  TO authenticated USING (
    public.has_role(auth.uid(),'admin')
    OR (NOT public.has_role(auth.uid(),'secretaria') AND NOT public.has_role(auth.uid(),'corretor'))
    OR public.has_notification_agency_access(auth.uid(),brand::text)
  ) WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR (NOT public.has_role(auth.uid(),'secretaria') AND NOT public.has_role(auth.uid(),'corretor'))
    OR public.has_notification_agency_access(auth.uid(),brand::text)
  );
