-- Confirmable assistant commands. Never exposed as model tools. Caller JWT is
-- retained throughout; business access is checked again inside the transaction.
CREATE TABLE public.assistant_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
 conversation_id uuid, bot_id text NOT NULL, scope_key text NOT NULL,
 type text NOT NULL CHECK(type IN ('agenda_event','attendance_note','attendance_stage_change','shared_selection','message_draft')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), expected_state jsonb NOT NULL DEFAULT '{}',
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','executed','failed','cancelled')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes', result jsonb, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz, executed_at timestamptz,
 confirmation_proof uuid,
 FOREIGN KEY(conversation_id,user_id) REFERENCES public.assistant_conversations(id,user_id),
 CHECK((type='agenda_event' AND bot_id='agenda') OR (type='shared_selection' AND bot_id='match') OR (type IN ('attendance_note','attendance_stage_change','message_draft') AND bot_id='lead'))
);
CREATE INDEX assistant_actions_owner_idx ON public.assistant_actions(user_id,status,created_at DESC);
CREATE TABLE public.assistant_action_receipts (
 action_id uuid PRIMARY KEY REFERENCES public.assistant_actions(id), user_id uuid NOT NULL REFERENCES auth.users(id),
 revision integer NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.assistant_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_action_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.assistant_actions, public.assistant_action_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,user_id,conversation_id,bot_id,scope_key,type,payload,expected_state,revision,schema_version,status,expires_at,result,error_code,created_at,updated_at,confirmed_at,executed_at) ON public.assistant_actions TO authenticated;
GRANT SELECT ON public.assistant_action_receipts TO authenticated;
GRANT ALL ON public.assistant_actions, public.assistant_action_receipts TO service_role;

CREATE FUNCTION public.assistant_action_target_access(_type text,_payload jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_role text:=split_part(public.assistant_current_scope(),':',1); v_id uuid; v_agency text;
BEGIN
 IF v_uid IS NULL OR v_role NOT IN ('admin','secretaria','corretor') THEN RETURN false; END IF;
 IF _payload ? 'attendanceId' THEN
   v_id:=(_payload->>'attendanceId')::uuid;
   IF NOT public.attendance_can_access(v_id) THEN RETURN false; END IF;
 END IF;
 IF _payload ? 'clientId' THEN
   IF NOT EXISTS(SELECT 1 FROM public.clients c WHERE c.id=(_payload->>'clientId')::uuid
     AND public.has_notification_agency_access(v_uid,c.brand::text)
     AND (v_role IN ('admin','secretaria') OR c.created_by=v_uid OR c.assigned_broker_id::text=v_uid::text)) THEN RETURN false; END IF;
 END IF;
 IF _payload ? 'agency' THEN
   v_agency:=_payload->>'agency';
   IF v_agency NOT IN ('cordial','morar','ambas') OR NOT public.has_notification_agency_access(v_uid,v_agency) THEN RETURN false; END IF;
 END IF;
 IF _payload ? 'propertyId' AND NOT EXISTS(SELECT 1 FROM public.properties p WHERE p.id=(_payload->>'propertyId')::uuid AND p.archived_at IS NULL) THEN RETURN false; END IF;
 IF _type='shared_selection' THEN
   IF jsonb_typeof(_payload->'propertyIds')<>'array' OR jsonb_array_length(_payload->'propertyIds') NOT BETWEEN 1 AND 60 THEN RETURN false; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(_payload->'propertyIds') i(id) LEFT JOIN public.properties p ON p.id=i.id::uuid WHERE p.id IS NULL OR p.archived_at IS NOT NULL) THEN RETURN false; END IF;
   IF _payload ? 'brokerId' AND (_payload->>'brokerId')::uuid<>v_uid AND v_role NOT IN ('admin','secretaria') THEN RETURN false; END IF;
 END IF;
 IF _type IN ('attendance_note','attendance_stage_change','message_draft') AND NOT (_payload ? 'attendanceId') THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.assistant_action_target_access(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_action_target_access(text,jsonb) TO authenticated,service_role;
CREATE POLICY assistant_actions_read ON public.assistant_actions FOR SELECT TO authenticated USING
 (((user_id=auth.uid() AND scope_key=public.assistant_current_scope()) OR (user_id<>auth.uid() AND public.has_role(auth.uid(),'admin'))) AND public.assistant_action_target_access(type,payload));
CREATE POLICY assistant_receipts_read ON public.assistant_action_receipts FOR SELECT TO authenticated USING
 (user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.assistant_actions a WHERE a.id=action_id));
CREATE FUNCTION public.assistant_action_authorize(_id uuid,_user_id uuid,_scope_key text,_revision integer,_nonce uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_proof uuid;
BEGIN
 UPDATE public.assistant_actions SET confirmation_proof=coalesce(confirmation_proof,_nonce)
 WHERE id=_id AND user_id=_user_id AND scope_key=_scope_key AND revision=_revision AND status IN ('pending','confirmed','executed')
 RETURNING confirmation_proof INTO v_proof;
 IF v_proof IS NULL THEN RAISE EXCEPTION 'action_unavailable'; END IF;
 RETURN v_proof;
END $$;
REVOKE ALL ON FUNCTION public.assistant_action_authorize(uuid,uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_action_authorize(uuid,uuid,text,integer,uuid) TO service_role;

-- Narrow shared creation command. It preserves the Agenda defaults and returns
-- the existing event for a repeated operation key. Its caller owns the JWT.
ALTER TABLE public.agenda_events ADD COLUMN IF NOT EXISTS assistant_operation_id uuid;
CREATE UNIQUE INDEX agenda_assistant_operation_uidx ON public.agenda_events(assistant_operation_id) WHERE assistant_operation_id IS NOT NULL;
CREATE FUNCTION public.agenda_create_assistant_event(_operation_id uuid,_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_id uuid; v_owner uuid; v_att public.attendances; v_start timestamptz; v_end timestamptz; v_kind text; v_agency text;
BEGIN
 IF NOT public.assistant_action_target_access('agenda_event',_payload) THEN RAISE EXCEPTION 'record_unavailable'; END IF;
 IF _operation_id IS NULL THEN RAISE EXCEPTION 'invalid_payload'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.assistant_actions WHERE id=_operation_id AND user_id=v_uid AND status='confirmed' AND payload=_payload AND type='agenda_event') THEN RAISE EXCEPTION 'interactive_confirmation_required'; END IF;
 SELECT id INTO v_id FROM public.agenda_events WHERE assistant_operation_id=_operation_id AND created_by=v_uid;
 IF FOUND THEN RETURN v_id; END IF;
 v_kind:=_payload->>'kind'; v_agency:=_payload->>'agency';
 IF v_kind NOT IN ('visita','reuniao','retorno','interno','outro') OR length(trim(_payload->>'title')) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'invalid_payload'; END IF;
 v_start:=(_payload->>'start')::timestamptz; v_end:=(_payload->>'end')::timestamptz;
 IF v_end<=v_start OR v_end-v_start>interval '24 hours' THEN RAISE EXCEPTION 'invalid_payload'; END IF;
 v_owner:=v_uid;
 IF _payload ? 'attendanceId' THEN
   SELECT * INTO v_att FROM public.attendances WHERE id=(_payload->>'attendanceId')::uuid FOR UPDATE;
   IF v_att.imobiliaria<>v_agency THEN RAISE EXCEPTION 'agency_mismatch'; END IF;
   v_owner:=coalesce(nullif(v_att.corretor_id::text,'')::uuid,v_uid);
 END IF;
 INSERT INTO public.agenda_events(created_by,owner_user_id,tipo,status,prioridade,imobiliaria,titulo,descricao,observacoes,inicio,fim,duracao_min,dia_inteiro,repeticao,atendimento_id,cliente_id,cliente_nome,imovel_id,responsavel_nome,google_calendar_sync_status,assistant_operation_id)
 VALUES(v_uid,v_owner,v_kind::public.agenda_tipo,'agendado','media',v_agency::public.agenda_imobiliaria,trim(_payload->>'title'),nullif(_payload->>'notes',''),nullif(_payload->>'notes',''),v_start,v_end,greatest(1,extract(epoch from(v_end-v_start))::integer/60),false,'nao',
   nullif(_payload->>'attendanceId','')::uuid,coalesce(nullif(_payload->>'clientId','')::uuid,v_att.cliente_id),v_att.cliente_nome,coalesce(nullif(_payload->>'propertyId','')::uuid,v_att.imovel_id),(SELECT nome FROM public.profiles WHERE id=v_owner),'nao_sincronizado',_operation_id)
 RETURNING id INTO v_id;
 -- Internal reminders only. No guests, email or WhatsApp are accepted here.
 INSERT INTO public.agenda_event_reminders(event_id,tipo,antecedencia_min,ativo,canal_futuro)
 SELECT v_id,'interno',m,true,false FROM unnest(ARRAY[1440,60,30]) m
 WHERE NOT EXISTS(SELECT 1 FROM public.agenda_event_reminders r WHERE r.event_id=v_id AND r.tipo::text='interno' AND r.antecedencia_min=m);
 IF _payload ? 'attendanceId' AND v_kind='visita' THEN
   UPDATE public.attendances SET status='visita_agendada',pipeline_stage='visita',proximo_retorno=v_start,proximo_passo='agendar_visita' WHERE id=v_att.id;
 END IF;
 RETURN v_id;
END $$;
-- Internal command: normal users cannot bypass the action confirmation endpoint.
REVOKE ALL ON FUNCTION public.agenda_create_assistant_event(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.agenda_create_assistant_event(uuid,jsonb) TO authenticated;

-- Privileged helpers touch assistant bookkeeping only. The opaque proof is
-- minted by the server after interactive validation and never selectable by a
-- browser/delegated OAuth token. Locks persist through the invoker transaction.
CREATE FUNCTION public.assistant_action_begin(_id uuid,_revision integer,_proof uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.assistant_actions;
BEGIN
 IF auth.uid() IS NULL OR nullif(auth.jwt()->>'client_id','') IS NOT NULL THEN RAISE EXCEPTION 'interactive_confirmation_required'; END IF;
 SELECT * INTO a FROM public.assistant_actions WHERE id=_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR _proof IS NULL OR a.confirmation_proof IS DISTINCT FROM _proof OR a.scope_key<>public.assistant_current_scope() THEN RAISE EXCEPTION 'action_unavailable'; END IF;
 IF a.revision<>_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
 IF a.status='executed' THEN RETURN to_jsonb(a)-'confirmation_proof'; END IF;
 IF a.status<>'pending' THEN RAISE EXCEPTION 'action_not_pending'; END IF;
 IF a.expires_at<=now() THEN RAISE EXCEPTION 'action_expired'; END IF;
 UPDATE public.assistant_actions SET status='confirmed',confirmed_at=now(),updated_at=now() WHERE id=a.id RETURNING * INTO a;
 RETURN to_jsonb(a)-'confirmation_proof';
END $$;
CREATE FUNCTION public.assistant_action_finish(_id uuid,_revision integer,_proof uuid,_result jsonb,_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.assistant_actions;
BEGIN
 SELECT * INTO a FROM public.assistant_actions WHERE id=_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR _proof IS NULL OR a.confirmation_proof IS DISTINCT FROM _proof OR a.revision<>_revision OR a.status<>'confirmed' THEN RAISE EXCEPTION 'action_unavailable'; END IF;
 IF _error IS NULL THEN
   INSERT INTO public.assistant_action_receipts(action_id,user_id,revision,result) VALUES(a.id,a.user_id,a.revision,_result);
   UPDATE public.assistant_actions SET status='executed',result=_result,executed_at=now(),updated_at=now() WHERE id=a.id;
 ELSE
   UPDATE public.assistant_actions SET status='failed',error_code=_error,updated_at=now() WHERE id=a.id;
 END IF;
 INSERT INTO public.assistant_audit(user_id,conversation_id,bot_id,scope_key,tool,params,result_summary,duration_ms)
 SELECT a.user_id,a.conversation_id,a.bot_id,a.scope_key,'confirm_action',jsonb_build_object('id',a.id,'revision',a.revision),jsonb_build_object('status',status,'errorCode',error_code),0 FROM public.assistant_actions WHERE id=a.id;
 SELECT * INTO a FROM public.assistant_actions WHERE id=a.id;
 RETURN to_jsonb(a)-'confirmation_proof';
END $$;
REVOKE ALL ON FUNCTION public.assistant_action_begin(uuid,integer,uuid), public.assistant_action_finish(uuid,integer,uuid,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_action_begin(uuid,integer,uuid), public.assistant_action_finish(uuid,integer,uuid,jsonb,text) TO authenticated;

CREATE FUNCTION public.assistant_action_execute(_id uuid,_revision integer,_proof uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.assistant_actions; v_result jsonb; v_id uuid; v_att public.attendances; v_note uuid; v_props uuid[]; v_selection jsonb; v_expected text; v_code text;
BEGIN
 IF auth.uid() IS NULL OR nullif(auth.jwt()->>'client_id','') IS NOT NULL THEN RAISE EXCEPTION 'interactive_confirmation_required'; END IF;
 SELECT * INTO a FROM jsonb_populate_record(NULL::public.assistant_actions,public.assistant_action_begin(_id,_revision,_proof));
 IF NOT public.assistant_action_target_access(a.type,a.payload) THEN RAISE EXCEPTION 'action_unavailable'; END IF;
 IF a.status='executed' THEN RETURN to_jsonb(a); END IF;
 BEGIN
   IF a.payload ? 'attendanceId' THEN
     SELECT * INTO v_att FROM public.attendances WHERE id=(a.payload->>'attendanceId')::uuid FOR UPDATE;
     IF a.expected_state ? 'attendanceUpdatedAt' AND v_att.updated_at IS DISTINCT FROM (a.expected_state->>'attendanceUpdatedAt')::timestamptz THEN RAISE EXCEPTION 'stale_target'; END IF;
   END IF;
   CASE a.type
   WHEN 'agenda_event' THEN
     v_id:=public.agenda_create_assistant_event(a.id,a.payload);
     v_result:=jsonb_build_object('href','/agenda?id='||v_id,'text','Compromisso criado.','recordId',v_id,'syncPending',true);
   WHEN 'attendance_note' THEN
     IF length(trim(a.payload->>'text')) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'invalid_payload'; END IF;
     v_note:=public.attendance_add_note(v_att.id,a.payload->>'text');
     v_result:=jsonb_build_object('href','/atendimentos?id='||v_att.id,'text','Anotação registrada.','recordId',v_note);
   WHEN 'attendance_stage_change' THEN
     v_expected:=a.expected_state->>'pipelineStage';
     IF v_att.pipeline_stage::text IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'stale_target'; END IF;
     IF a.payload->>'to' NOT IN ('primeiro_contato','apresentando_solucao','visita','proposta','fechamento','perdido','em_espera','arquivado') THEN RAISE EXCEPTION 'invalid_payload'; END IF;
     IF a.payload->>'to'='perdido' AND length(trim(coalesce(a.payload->>'reason','')))=0 THEN RAISE EXCEPTION 'loss_reason_required'; END IF;
     UPDATE public.attendances SET pipeline_stage=(a.payload->>'to')::public.pipeline_stage,
       status=CASE WHEN a.payload->>'to'='perdido' THEN 'perdido' WHEN a.payload->>'to'='arquivado' THEN 'arquivado' WHEN a.payload->>'to'='em_espera' THEN 'aguardando_retorno'
         WHEN v_att.pipeline_stage::text IN ('perdido','arquivado','em_espera') OR v_att.status IN ('perdido','arquivado') THEN 'em_atendimento' ELSE status END,
       motivo_perda=CASE WHEN a.payload->>'to'='perdido' THEN a.payload->>'reason' WHEN v_att.pipeline_stage::text IN ('perdido','arquivado','em_espera') THEN NULL ELSE motivo_perda END WHERE id=v_att.id;
     v_result:=jsonb_build_object('href','/atendimentos?id='||v_att.id,'text','Etapa atualizada.','recordId',v_att.id);
   WHEN 'shared_selection' THEN
     SELECT array_agg(id::uuid) INTO v_props FROM jsonb_array_elements_text(a.payload->'propertyIds') i(id);
     v_selection:=public.shared_selection_save(NULL::uuid,a.id::text,a.payload->>'agency',a.payload->>'title',a.payload->>'publicMessage',
       coalesce((SELECT full_name FROM public.clients WHERE id=nullif(a.payload->>'clientId','')::uuid),''),'',now()+make_interval(days=>coalesce((a.payload->>'expiresDays')::integer,30)),v_props,nullif(a.payload->>'brokerId','')::uuid);
     IF NOT coalesce((v_selection->>'ok')::boolean,false) THEN RAISE EXCEPTION 'selection_ineligible'; END IF;
     v_result:=jsonb_build_object('href','/s/'||(v_selection->>'token'),'text','Seleção criada. Revise o link antes de compartilhar.','recordId',v_selection->>'id');
   WHEN 'message_draft' THEN
     IF length(trim(a.payload->>'text')) NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'invalid_payload'; END IF;
     v_result:=jsonb_build_object('href','/atendimentos?id='||v_att.id,'text','Rascunho pronto para copiar. Nenhuma mensagem foi enviada.','draft',a.payload->>'text');
   ELSE RAISE EXCEPTION 'action_not_supported';
   END CASE;
 EXCEPTION WHEN OTHERS THEN
   v_code:=CASE WHEN SQLERRM IN ('stale_target','loss_reason_required','selection_ineligible','record_unavailable','agency_mismatch','invalid_payload') THEN SQLERRM ELSE 'execution_failed' END;
 END;
 RETURN public.assistant_action_finish(a.id,a.revision,_proof,v_result,v_code);
END $$;
REVOKE ALL ON FUNCTION public.assistant_action_execute(uuid,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_action_execute(uuid,integer,uuid) TO authenticated;
CREATE FUNCTION public.assistant_action_mutate_metadata(_id uuid,_revision integer,_operation text,_payload jsonb,_expected_state jsonb,_proof uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.assistant_actions;
BEGIN
 IF auth.uid() IS NULL OR nullif(auth.jwt()->>'client_id','') IS NOT NULL THEN RAISE EXCEPTION 'interactive_confirmation_required'; END IF;
 SELECT * INTO a FROM public.assistant_actions WHERE id=_id AND user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR _proof IS NULL OR a.confirmation_proof IS DISTINCT FROM _proof OR a.scope_key<>public.assistant_current_scope() THEN RAISE EXCEPTION 'action_unavailable'; END IF;
 IF a.revision<>_revision THEN RAISE EXCEPTION 'stale_revision'; END IF;
 IF a.status<>'pending' THEN RAISE EXCEPTION 'action_not_pending'; END IF;
 IF _operation='cancel' THEN
   UPDATE public.assistant_actions SET status='cancelled',confirmation_proof=NULL,updated_at=now() WHERE id=a.id;
 ELSIF _operation='edit' THEN
   IF a.expires_at<=now() THEN RAISE EXCEPTION 'action_expired'; END IF;
   IF jsonb_typeof(_payload)<>'object' THEN RAISE EXCEPTION 'invalid_payload'; END IF;
   UPDATE public.assistant_actions SET payload=_payload,expected_state=coalesce(_expected_state,'{}'),revision=revision+1,confirmation_proof=NULL,updated_at=now() WHERE id=a.id;
 ELSE RAISE EXCEPTION 'invalid_operation'; END IF;
 INSERT INTO public.assistant_audit(user_id,conversation_id,bot_id,scope_key,tool,params,result_summary,duration_ms)
 VALUES(a.user_id,a.conversation_id,a.bot_id,a.scope_key,_operation||'_action',jsonb_build_object('id',a.id,'revision',a.revision),jsonb_build_object('status','ok'),0);
 SELECT * INTO a FROM public.assistant_actions WHERE id=a.id;
 RETURN to_jsonb(a)-'confirmation_proof';
END $$;
REVOKE ALL ON FUNCTION public.assistant_action_mutate_metadata(uuid,integer,text,jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_action_mutate_metadata(uuid,integer,text,jsonb,jsonb,uuid) TO authenticated;
CREATE FUNCTION public.assistant_action_mutate(_id uuid,_revision integer,_operation text,_payload jsonb,_expected_state jsonb,_proof uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE a public.assistant_actions;
BEGIN
 SELECT id,type,payload INTO a.id,a.type,a.payload FROM public.assistant_actions WHERE id=_id AND user_id=auth.uid();
 IF NOT FOUND OR NOT public.assistant_action_target_access(a.type,coalesce(_payload,a.payload)) THEN RAISE EXCEPTION 'action_unavailable'; END IF;
 RETURN public.assistant_action_mutate_metadata(_id,_revision,_operation,_payload,_expected_state,_proof);
END $$;
REVOKE ALL ON FUNCTION public.assistant_action_mutate(uuid,integer,text,jsonb,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assistant_action_mutate(uuid,integer,text,jsonb,jsonb,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
