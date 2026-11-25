-- Rollback: tests/sql/rollback_0114_rental_confirm_workflow_file.sql (definição lida do banco antes desta migração).
-- Preserva assinatura, invoker (não SECURITY DEFINER), search_path, owner e grants (CREATE OR REPLACE não altera ACL).
CREATE OR REPLACE FUNCTION public.rental_confirm_workflow_file(p_actor uuid, p_id uuid, p_document uuid, p_revision text, p_reviewed boolean, p_materialize jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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

    IF jsonb_typeof(p_materialize->'property') IS DISTINCT FROM 'object'
      OR jsonb_typeof(p_materialize->'contract') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Dados do aluguel incompletos. Salve o rascunho novamente.' USING ERRCODE='22023';
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
      IF jsonb_typeof(entry) IS DISTINCT FROM 'object' THEN
        RAISE EXCEPTION 'Dados do aluguel incompletos. Salve o rascunho novamente.' USING ERRCODE='22023';
      END IF;
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
      g := jsonb_populate_record(NULL::public.rental_guarantors, nullif(entry->'person','null'::jsonb));
      IF entry->>'tipo'='fiador' THEN
        IF jsonb_typeof(entry->'person') IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'Informe o fiador.' USING ERRCODE='22023';
        END IF;
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
END $function$;