-- One explicitly authorized synthetic lead; never a general form assignment.
-- Apply through the Drizzle journal. No external request or worker configuration.
CREATE TABLE public.meta_lead_test_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 connection_id uuid NOT NULL, imobiliaria text NOT NULL CHECK(imobiliaria IN ('cordial','morar')),
 app_id text NOT NULL CHECK(app_id ~ '^[0-9]{1,80}$'),
 page_id text NOT NULL CHECK(page_id ~ '^[0-9]{1,80}$'),
 form_id text NOT NULL CHECK(form_id ~ '^[0-9]{1,80}$'),
 leadgen_id text NOT NULL CHECK(leadgen_id ~ '^[0-9]{1,80}$'),
 broker_id uuid NOT NULL REFERENCES public.profiles(id),
 finalidade text NOT NULL CHECK(finalidade IN ('compra','aluguel','ambos')),
 tipo_imovel text NOT NULL CHECK(tipo_imovel IN ('casa','apartamento','kitnet','terreno','sala_comercial','area_rural','sitio_chacara','outro')),
 field_mapping jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(field_mapping)='object'),
 authorized_by uuid NOT NULL REFERENCES public.profiles(id),
 verified_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(connection_id,imobiliaria) REFERENCES public.ad_platform_connections(id,imobiliaria),
 UNIQUE(app_id,page_id,leadgen_id), CHECK(expires_at>verified_at)
);
--> statement-breakpoint
ALTER TABLE public.meta_lead_test_authorizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_reviewer_block ON public.meta_lead_test_authorizations AS RESTRICTIVE FOR ALL TO authenticated USING(NOT public.is_meta_reviewer()) WITH CHECK(NOT public.is_meta_reviewer());
REVOKE ALL ON public.meta_lead_test_authorizations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.meta_lead_test_authorizations TO service_role;
GRANT UPDATE(enabled) ON public.meta_lead_test_authorizations TO service_role;
ALTER TABLE public.meta_lead_submissions ADD COLUMN is_synthetic boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Existing assignable-broker semantics: an administrator is eligible; internal
-- profiles may be explicitly assigned only by themselves. Reviewer always loses.
CREATE FUNCTION public.meta_lead_test_broker_allowed(p_broker uuid,p_actor uuid,p_agency text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT p_broker IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_broker AND role::text='meta_reviewer')
 AND (public.has_role(p_broker,'corretor') OR public.has_role(p_broker,'admin'))
 AND public.has_notification_agency_access(p_broker,p_agency)
 AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_broker AND (coalesce((to_jsonb(p)->>'is_internal')::boolean,false)=false OR p_broker=p_actor))
$$;
--> statement-breakpoint
-- Call only after a scoped Graph /form/test_leads read proves this exact ID.
-- The timestamp records that operator evidence; this SQL function makes no claim
-- of independently calling Meta. Service-only: not an arbitrary browser grant.
CREATE FUNCTION public.meta_lead_test_authorize(
 p_actor uuid,p_connection_id uuid,p_leadgen_id text,p_form_id text,p_broker_id uuid,
 p_finalidade text,p_tipo_imovel text,p_field_mapping jsonb,p_verified_at timestamptz,p_expires_at timestamptz
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.ad_platform_connections;t public.meta_lead_test_authorizations;s public.meta_lead_submissions;v_id uuid;
BEGIN
 SELECT * INTO c FROM public.ad_platform_connections WHERE id=p_connection_id FOR SHARE;
 IF c.id IS NULL OR c.platform<>'meta' OR c.app_id IS NULL OR c.page_id IS NULL OR c.imobiliaria NOT IN ('cordial','morar')
 OR NOT public.marketing_actor_can_act(p_actor,'manage_connection',c.imobiliaria)
 OR NOT public.has_notification_agency_access(p_actor,c.imobiliaria) THEN RAISE EXCEPTION 'Test actor or connection outside agency'; END IF;
 IF p_leadgen_id IS NULL OR p_leadgen_id !~ '^[0-9]{1,80}$' OR p_form_id IS NULL OR p_form_id !~ '^[0-9]{1,80}$'
 OR p_verified_at IS NULL OR p_verified_at<now()-interval '10 minutes' OR p_verified_at>now()+interval '30 seconds'
 OR p_expires_at IS NULL OR p_expires_at<=now() OR p_expires_at>now()+interval '24 hours'
 OR p_field_mapping IS NULL OR jsonb_typeof(p_field_mapping)<>'object'
 THEN RAISE EXCEPTION 'Invalid synthetic test authorization'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_field_mapping) f WHERE f.key NOT IN ('full_name','phone','email','interest') OR jsonb_typeof(f.value)<>'string' OR length(f.value#>>'{}') NOT BETWEEN 1 AND 100)
 OR NOT public.meta_lead_test_broker_allowed(p_broker_id,p_actor,c.imobiliaria) THEN RAISE EXCEPTION 'Invalid test fields or assignee'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('meta-test:'||c.app_id||':'||c.page_id||':'||p_leadgen_id,0));
 SELECT * INTO s FROM public.meta_lead_submissions WHERE app_id=c.app_id AND page_id=c.page_id AND leadgen_id=p_leadgen_id FOR UPDATE;
 IF s.id IS NOT NULL AND (s.privacy_deleted_at IS NOT NULL OR s.attendance_id IS NOT NULL OR s.form_id IS DISTINCT FROM p_form_id) THEN RAISE EXCEPTION 'Existing lead cannot become a synthetic test'; END IF;
 SELECT * INTO t FROM public.meta_lead_test_authorizations WHERE app_id=c.app_id AND page_id=c.page_id AND leadgen_id=p_leadgen_id;
 IF t.id IS NOT NULL THEN
 IF t.connection_id=p_connection_id AND t.form_id=p_form_id AND t.broker_id=p_broker_id AND t.authorized_by=p_actor AND t.finalidade=p_finalidade AND t.tipo_imovel=p_tipo_imovel AND t.field_mapping=p_field_mapping AND t.enabled AND t.expires_at>now() THEN RETURN t.id; END IF;
 RAISE EXCEPTION 'Synthetic identity already reserved';
 END IF;
 IF EXISTS(SELECT 1 FROM public.meta_lead_form_mappings WHERE app_id=c.app_id AND page_id=c.page_id AND form_id=p_form_id AND enabled) THEN RAISE EXCEPTION 'Synthetic test requires an unmapped form'; END IF;
 INSERT INTO public.meta_lead_test_authorizations(connection_id,imobiliaria,app_id,page_id,form_id,leadgen_id,broker_id,finalidade,tipo_imovel,field_mapping,authorized_by,verified_at,expires_at)
 VALUES(c.id,c.imobiliaria,c.app_id,c.page_id,p_form_id,p_leadgen_id,p_broker_id,p_finalidade,p_tipo_imovel,p_field_mapping,p_actor,p_verified_at,p_expires_at) RETURNING id INTO v_id;
 UPDATE public.meta_lead_submissions SET is_synthetic=true WHERE id=s.id;
 RETURN v_id;
END $$;
--> statement-breakpoint
-- A known test identity is a tombstone too: disabled/expired/context-changed
-- authorization NEVER falls back to a normal mapping, even added later.
CREATE FUNCTION public.meta_lead_effective_mapping(p_connection_id uuid,p_app_id text,p_page_id text,p_form_id text,p_leadgen_id text)
RETURNS SETOF public.meta_lead_form_mappings LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.meta_lead_test_authorizations;c public.ad_platform_connections;
BEGIN
 SELECT * INTO c FROM public.ad_platform_connections WHERE id=p_connection_id AND platform='meta' AND app_id=p_app_id AND page_id=p_page_id;
 IF c.id IS NULL THEN RETURN; END IF;
 SELECT * INTO t FROM public.meta_lead_test_authorizations WHERE app_id=p_app_id AND page_id=p_page_id AND leadgen_id=p_leadgen_id;
 IF t.id IS NOT NULL THEN
 IF t.enabled AND t.expires_at>now() AND t.connection_id=c.id AND t.imobiliaria=c.imobiliaria AND t.form_id=p_form_id
 AND public.marketing_actor_can_act(t.authorized_by,'manage_connection',t.imobiliaria)
 AND public.meta_lead_test_broker_allowed(t.broker_id,t.authorized_by,t.imobiliaria) THEN
 RETURN NEXT jsonb_populate_record(NULL::public.meta_lead_form_mappings,jsonb_build_object('id',t.id,'connection_id',t.connection_id,'app_id',t.app_id,'page_id',t.page_id,'form_id',t.form_id,'imobiliaria',t.imobiliaria,'field_mapping',t.field_mapping,'finalidade',t.finalidade,'tipo_imovel',t.tipo_imovel,'broker_id',t.broker_id,'created_by',t.authorized_by,'enabled',true));
 END IF;
 RETURN;
 END IF;
 RETURN QUERY SELECT m.* FROM public.meta_lead_form_mappings m WHERE m.connection_id=c.id AND m.app_id=p_app_id AND m.page_id=p_page_id AND m.form_id=p_form_id AND m.imobiliaria=c.imobiliaria AND m.enabled;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_lead_mapping_for_submission(p_id uuid,p_worker_id uuid,p_form_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.meta_lead_submissions;v_mapping jsonb;
BEGIN
 SELECT * INTO s FROM public.meta_lead_submissions WHERE id=p_id;
 IF s.id IS NULL OR s.privacy_deleted_at IS NOT NULL OR s.status<>'processing' OR s.worker_id IS DISTINCT FROM p_worker_id OR s.lease_until IS NULL OR s.lease_until<now() OR (s.form_id IS NOT NULL AND s.form_id IS DISTINCT FROM p_form_id) THEN RAISE EXCEPTION 'Stale lead lease'; END IF;
 SELECT field_mapping INTO v_mapping FROM public.meta_lead_effective_mapping(s.connection_id,s.app_id,s.page_id,p_form_id,s.leadgen_id);
 RETURN coalesce(v_mapping,'{}'::jsonb);
END $$;
--> statement-breakpoint
CREATE FUNCTION public.meta_lead_connection_for_event(p_app_id text,p_page_id text,p_form_id text,p_leadgen_id text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer;v_id uuid;
BEGIN
 SELECT count(*),(array_agg(id))[1] INTO v_count,v_id FROM public.ad_platform_connections WHERE platform='meta' AND app_id=p_app_id AND page_id=p_page_id AND imobiliaria IN ('cordial','morar');
 IF v_count=1 THEN RETURN v_id; END IF;
 SELECT count(*),(array_agg(c.id))[1] INTO v_count,v_id FROM public.ad_platform_connections c CROSS JOIN LATERAL public.meta_lead_effective_mapping(c.id,p_app_id,p_page_id,p_form_id,p_leadgen_id) m WHERE c.platform='meta' AND c.app_id=p_app_id AND c.page_id=p_page_id;
 RETURN CASE WHEN v_count=1 THEN v_id ELSE NULL END;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meta_lead_ingest(p_app_id text,p_events jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb;c public.ad_platform_connections;inserted integer:=0;affected integer;
BEGIN
 IF p_events IS NULL OR jsonb_typeof(p_events)<>'array' OR jsonb_array_length(p_events)>1000 THEN RAISE EXCEPTION 'Invalid event envelope'; END IF;
 FOR e IN SELECT value FROM jsonb_array_elements(p_events) LOOP
 SELECT * INTO c FROM public.ad_platform_connections WHERE id=public.meta_lead_connection_for_event(p_app_id,e->>'page_id',e->>'form_id',e->>'leadgen_id');
 INSERT INTO public.meta_lead_submissions(app_id,page_id,leadgen_id,form_id,ad_id,adset_id,external_campaign_id,meta_created_at,connection_id,imobiliaria,status,last_error,is_synthetic)
 VALUES(p_app_id,e->>'page_id',e->>'leadgen_id',e->>'form_id',e->>'ad_id',e->>'adset_id',e->>'campaign_id',nullif(e->>'created_time','')::timestamptz,c.id,c.imobiliaria,CASE WHEN c.id IS NULL THEN 'quarantined' ELSE 'queued' END,CASE WHEN c.id IS NULL THEN 'page_unknown_or_ambiguous' ELSE NULL END,EXISTS(SELECT 1 FROM public.meta_lead_test_authorizations WHERE app_id=p_app_id AND page_id=e->>'page_id' AND leadgen_id=e->>'leadgen_id'))
 ON CONFLICT(app_id,page_id,leadgen_id) DO NOTHING;
 GET DIAGNOSTICS affected=ROW_COUNT;inserted:=inserted+affected;
 END LOOP;RETURN inserted;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meta_lead_complete(p_id uuid,p_worker_id uuid,p_fields jsonb) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.meta_lead_submissions;m public.meta_lead_form_mappings;v_name text;v_phone text;v_email text;contact_count integer;v_client uuid;v_attendance uuid;v_actor uuid;broker_name text;v_lock text;t public.meta_lead_test_authorizations;
BEGIN
 SELECT * INTO s FROM public.meta_lead_submissions WHERE id=p_id FOR UPDATE;
 IF s.id IS NULL OR s.privacy_deleted_at IS NOT NULL OR s.status<>'processing' OR s.worker_id IS DISTINCT FROM p_worker_id OR s.lease_until IS NULL OR s.lease_until<now() THEN RAISE EXCEPTION 'Stale lead lease'; END IF;
 v_name:=nullif(left(btrim(p_fields->>'full_name'),300),'');v_phone:=nullif(left(p_fields->>'phone',50),'');v_email:=nullif(left(lower(btrim(p_fields->>'email')),320),'');
 SELECT * INTO m FROM public.meta_lead_effective_mapping(s.connection_id,s.app_id,s.page_id,s.form_id,s.leadgen_id);
 SELECT * INTO t FROM public.meta_lead_test_authorizations WHERE app_id=s.app_id AND page_id=s.page_id AND leadgen_id=s.leadgen_id;
 -- Even an allowlisted ID cannot write a real contact during this synthetic test.
 IF t.id IS NOT NULL AND (v_name IS NULL OR upper(v_name) NOT LIKE '%TESTE%' OR v_email IS NULL OR v_email !~ '^[a-z0-9._+-]+@example[.]invalid$' OR v_phone IS NOT NULL) THEN
 UPDATE public.meta_lead_submissions SET status='review',is_synthetic=true,last_error='synthetic_fields_required',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 IF (v_phone IS NOT NULL AND v_phone !~ '^\+?[0-9]{8,15}$') OR (v_email IS NOT NULL AND v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='invalid_contact_fields',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 UPDATE public.meta_lead_submissions SET is_synthetic=(t.id IS NOT NULL),full_name=v_name,phone=v_phone,email=v_email,field_data=p_fields->'field_data',campaign_id=(SELECT id FROM public.marketing_campaigns WHERE connection_id=s.connection_id AND imobiliaria=s.imobiliaria AND external_campaign_id=s.external_campaign_id LIMIT 1),updated_at=now() WHERE id=s.id;
 IF m.id IS NULL OR v_name IS NULL OR (v_phone IS NULL AND v_email IS NULL) OR m.finalidade IS NULL OR m.tipo_imovel IS NULL THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='incomplete_fields_or_mapping',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 IF m.imobiliaria IS DISTINCT FROM s.imobiliaria THEN RAISE EXCEPTION 'Form agency mismatch'; END IF;
 IF m.property_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.properties p WHERE p.id=m.property_id AND(p.carteira=m.imobiliaria OR m.imobiliaria=ANY(p.publish_targets))) THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='property_outside_agency',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 -- Full normalized contact, never the weak last-8-digits helper for an automatic merge.
 FOR v_lock IN SELECT k FROM unnest(ARRAY[CASE WHEN v_phone IS NULL THEN NULL ELSE 'phone:'||public.meta_phone_identity(v_phone) END,CASE WHEN v_email IS NULL THEN NULL ELSE 'email:'||v_email END]) AS keys(k) WHERE k IS NOT NULL ORDER BY k LOOP
 PERFORM pg_advisory_xact_lock(hashtextextended(s.imobiliaria||':'||v_lock,0));
 END LOOP;
 SELECT count(*),(array_agg(id))[1] INTO contact_count,v_client FROM public.clients WHERE brand=s.imobiliaria AND ((v_phone IS NOT NULL AND public.meta_phone_identity(public.clients.phone)=public.meta_phone_identity(v_phone)) OR(v_email IS NOT NULL AND lower(public.clients.email)=v_email));
 IF contact_count=1 AND EXISTS(SELECT 1 FROM public.clients cl WHERE cl.id=v_client AND ((v_phone IS NOT NULL AND nullif(cl.phone,'') IS NOT NULL AND public.meta_phone_identity(cl.phone)<>public.meta_phone_identity(v_phone)) OR(v_email IS NOT NULL AND nullif(cl.email,'') IS NOT NULL AND lower(cl.email)<>v_email))) THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='conflicting_contact_details',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 IF contact_count>1 OR EXISTS(SELECT 1 FROM public.attendances a WHERE a.imobiliaria=s.imobiliaria AND ((v_phone IS NOT NULL AND public.meta_phone_identity(a.telefone)=public.meta_phone_identity(v_phone)) OR(v_email IS NOT NULL AND lower(a.email)=v_email)) AND a.status NOT IN ('fechado','perdido','arquivado')) THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='ambiguous_or_open_contact',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 SELECT user_id INTO v_actor FROM public.ad_platform_connections WHERE id=s.connection_id;
 IF v_actor IS NULL OR EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=v_actor AND role::text='meta_reviewer') THEN RAISE EXCEPTION 'Integration actor missing'; END IF;
 IF m.broker_id IS NOT NULL THEN
 IF EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=m.broker_id AND role::text='meta_reviewer') OR NOT public.has_notification_agency_access(m.broker_id,s.imobiliaria) OR (t.id IS NULL AND NOT public.has_role(m.broker_id,'corretor')) OR (t.id IS NOT NULL AND NOT public.meta_lead_test_broker_allowed(m.broker_id,t.authorized_by,s.imobiliaria)) THEN
 UPDATE public.meta_lead_submissions SET status='review',last_error='broker_outside_agency',worker_id=NULL,lease_until=NULL WHERE id=s.id;RETURN 'review';END IF;
 SELECT nome INTO broker_name FROM public.profiles WHERE id=m.broker_id;
 END IF;
 -- A new intention needs a client as well as an attendance. Never update an
 -- existing contact's name, agency, assignment, email or phone on import.
 IF contact_count=0 THEN
 INSERT INTO public.clients(created_by,brand,full_name,phone,email,client_type,contact_preference,lead_origin,assigned_broker_id,assigned_broker_name,status,purpose,property_type,notes)
 VALUES(v_actor,s.imobiliaria,v_name,coalesce(v_phone,''),v_email,CASE WHEN m.finalidade='aluguel' THEN 'locatario' ELSE 'comprador' END,CASE WHEN v_phone IS NULL THEN 'email' ELSE 'ligacao' END,'patrocinio',m.broker_id::text,broker_name,'novo',m.finalidade,m.tipo_imovel,CASE WHEN t.id IS NOT NULL THEN 'TESTE SINTÉTICO Meta Lead Ads; sem contato externo automático.' ELSE 'Origem: Meta Lead Ads; sem contato externo automático.' END) RETURNING id INTO v_client;
 END IF;
 INSERT INTO public.attendances(created_by,imobiliaria,cliente_id,cliente_nome,telefone,email,contato_preferencial,origem,fonte_prospeccao,finalidade,tipo_imovel,corretor_id,corretor_nome,imovel_id,imovel_ref,prioridade,status,pipeline_stage,historico_inicial,interesse_descricao)
 VALUES(v_actor,s.imobiliaria,v_client,v_name,coalesce(v_phone,''),v_email,CASE WHEN v_phone IS NULL THEN 'email' ELSE 'ligacao' END,'patrocinio','lead_imobiliaria',m.finalidade,m.tipo_imovel,m.broker_id::text,broker_name,m.property_id,m.property_id::text,'media','novo','primeiro_contato',CASE WHEN t.id IS NOT NULL THEN 'TESTE SINTÉTICO. ' ELSE '' END||'Integração Meta Lead Ads; submissão '||s.id::text||'. Ator: integração, sem contato externo automático.',nullif(p_fields->>'interest','')) RETURNING id INTO v_attendance;
 UPDATE public.meta_lead_submissions SET attendance_id=v_attendance,client_id=v_client,broker_id=m.broker_id,status=CASE WHEN m.broker_id IS NULL THEN 'unassigned' ELSE 'imported' END,completed_at=now(),worker_id=NULL,lease_until=NULL,last_error=NULL WHERE id=s.id;
 RETURN CASE WHEN m.broker_id IS NULL THEN 'unassigned' ELSE 'imported' END;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meta_lead_retry(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.meta_lead_submissions;c public.ad_platform_connections;
BEGIN
 SELECT * INTO s FROM public.meta_lead_submissions WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.privacy_deleted_at IS NOT NULL OR s.attendance_id IS NOT NULL OR s.status NOT IN ('failed','review','quarantined') THEN RAISE EXCEPTION 'Lead cannot be retried'; END IF;
 SELECT * INTO c FROM public.ad_platform_connections WHERE id=public.meta_lead_connection_for_event(s.app_id,s.page_id,s.form_id,s.leadgen_id);
 IF c.id IS NULL OR c.imobiliaria NOT IN ('cordial','morar') THEN RAISE EXCEPTION 'Unknown or ambiguous page'; END IF;
 UPDATE public.meta_lead_submissions SET connection_id=c.id,imobiliaria=c.imobiliaria,status='queued',attempts=0,next_attempt_at=now(),worker_id=NULL,lease_until=NULL,last_error=NULL,updated_at=now() WHERE id=s.id;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meta_lead_invalidate_connection_mappings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.app_id IS DISTINCT FROM OLD.app_id OR NEW.page_id IS DISTINCT FROM OLD.page_id OR NEW.imobiliaria IS DISTINCT FROM OLD.imobiliaria THEN
 UPDATE public.meta_lead_form_mappings SET enabled=false,updated_at=now() WHERE connection_id=OLD.id AND enabled;
 UPDATE public.meta_lead_test_authorizations SET enabled=false WHERE connection_id=OLD.id AND enabled;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.meta_lead_test_broker_allowed(uuid,uuid,text),public.meta_lead_test_authorize(uuid,uuid,text,text,uuid,text,text,jsonb,timestamptz,timestamptz),public.meta_lead_effective_mapping(uuid,text,text,text,text),public.meta_lead_mapping_for_submission(uuid,uuid,text),public.meta_lead_connection_for_event(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.meta_lead_test_broker_allowed(uuid,uuid,text),public.meta_lead_test_authorize(uuid,uuid,text,text,uuid,text,text,jsonb,timestamptz,timestamptz),public.meta_lead_effective_mapping(uuid,text,text,text,text),public.meta_lead_mapping_for_submission(uuid,uuid,text),public.meta_lead_connection_for_event(text,text,text,text) TO service_role;

--> statement-breakpoint
-- Synthetic E2E evidence is not commercial funnel volume.
CREATE OR REPLACE FUNCTION public.marketing_report_snapshot(p_agency text,p_since date,p_until date,p_account text DEFAULT NULL,p_platform text DEFAULT NULL,p_status text DEFAULT NULL,p_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; part jsonb; items jsonb:='[]'; n integer:=1; total integer; funnel jsonb;
BEGIN
 IF auth.uid() IS NULL OR public.has_role(auth.uid(),'meta_reviewer') OR NOT public.marketing_can_act('generate_report',p_agency) THEN RAISE EXCEPTION 'Sem permissão' USING ERRCODE='42501'; END IF;
 IF p_agency IS NULL OR p_agency NOT IN ('cordial','morar') OR p_since IS NULL OR p_until IS NULL OR p_until<p_since OR p_until-p_since>366 THEN RAISE EXCEPTION 'Invalid scope'; END IF;
 LOOP
  part:=public.marketing_campaigns_safe(p_imobiliaria=>p_agency,p_since=>p_since,p_until=>p_until,p_page=>n,p_page_size=>100,p_search=>p_search,p_platform=>p_platform,p_status=>p_status,p_account_id=>regexp_replace(p_account,'^act_',''));
  total:=(part->>'total')::integer;
  IF total>5000 THEN RAISE EXCEPTION 'Report scope exceeds 5000 campaigns; narrow filters'; END IF;
  items:=items||coalesce(part->'items','[]');
  EXIT WHEN n*100>=total; n:=n+1;
 END LOOP;
 SELECT jsonb_build_object('submissions',count(*),'attendances',count(DISTINCT attendance_id),'linkedSubmissions',count(campaign_id)) INTO funnel
 FROM public.meta_lead_submissions s
 WHERE s.imobiliaria=p_agency AND s.privacy_deleted_at IS NULL AND NOT s.is_synthetic
 AND (s.received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_since AND p_until
 AND (p_platform IS NULL OR p_platform='meta')
 AND (p_account IS NULL OR EXISTS(SELECT 1 FROM public.ad_platform_connections c WHERE c.id=s.connection_id AND c.imobiliaria=p_agency AND regexp_replace(c.external_account_id,'^act_','')=regexp_replace(p_account,'^act_','')))
 AND ((p_status IS NULL AND nullif(p_search,'') IS NULL) OR s.campaign_id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(items)));
 RETURN jsonb_build_object('items',items,'total',total,'financial_visible',part->'financial_visible','captured_at',statement_timestamp(),'funnel',funnel);
END $$;
