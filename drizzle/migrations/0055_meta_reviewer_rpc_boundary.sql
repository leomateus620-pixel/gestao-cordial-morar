-- Reviewer is a deny-dominant role, including for legacy RPCs checking has_role.
-- This does not grant or remove role memberships. Normal staff checks are unchanged.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role)
 AND (_role::text='meta_reviewer' OR NOT EXISTS(
   SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role::text='meta_reviewer'))
$$;
--> statement-breakpoint
-- Explicit inventory of pre-existing application RPCs audited on 2026-10-28.
-- These SECURITY DEFINER entry points bypass table RLS; several check only auth.uid().
-- Keep their deployed business bodies, signatures, defaults, ownership and ACLs.
-- This is deliberately not a rule rewriting every function or future migration.
-- Marketing's sanitized reads and identity/agency helpers are not in this list.
-- Anonymous public flows and service workers (no reviewer JWT) keep existing gates.
DO $migration$
DECLARE
 f record; body text; definition text; directives text; columns text; aliases text;
 guarded_names constant text[] := ARRAY[
  'agenciamento_can_edit','agenda_can_access','agenda_can_edit','agenda_is_participant',
  'assistant_mcp_client_permission','attendance_can_access','get_my_notification_summary',
  'inspection_can_access','inspection_can_edit','inspection_review_issues','list_corretores',
  'list_incomplete_registrations','list_my_notifications','morar_site_admin_public_list',
  'morar_site_can_publish','shared_selection_can_choose_responsible','shared_selection_can_manage',
  'shared_selection_check','assistant_action_begin','assistant_action_finish',
  'assistant_action_mutate_metadata','assistant_bot_config_save','assistant_delegation_revoke',
  'assistant_fact_put','assistant_mcp_client_set','assistant_routine_save_configured',
  'assistant_routine_state_configured','attendance_add_note','cordial_site_prepare_video',
  'cordial_site_review','cordial_site_review_video','cordial_site_save_content',
  'cordial_site_save_responsible','cordial_site_save_tour','cordial_site_triage',
  'email_queue_dispatch','find_attendance_contact_matches','get_corretores_response_metrics',
  'get_notification_attendance_statuses','get_notification_management_summary',
  'get_push_delivery_health','get_satisfaction_survey_by_token','inspection_reopen',
  'inspection_reorder_media','inspection_snapshot','list_assignable_brokers',
  'mark_all_notifications_read','mark_attendance_first_opened','mark_notification_read',
  'morar_site_inventory','morar_site_review','morar_site_review_batch','morar_site_save_content',
  'morar_site_triage','property_history_list','property_image_batch_bump',
  'property_image_delete_atomic','property_image_reclaim_stale','property_image_replace_atomic',
  'property_image_stage_replacement','property_image_upload_issues','property_image_upload_reserve',
  'reserve_provider_code','shared_selection_close','shared_selection_public',
  'shared_selection_responsibles','shared_selection_save','studio_daily_limit_ok',
  'studio_project_approve','submit_satisfaction_response'
 ];
 guard constant text := E'\n-- meta_reviewer_entry_guard_v1\nIF public.is_meta_reviewer() THEN\n RAISE EXCEPTION ''Acesso interno indisponível para avaliação Meta.'' USING ERRCODE=''42501'';\nEND IF;\n';
BEGIN
 FOR f IN
  SELECT p.oid,p.proname,p.prosrc,p.proretset,p.proargmodes,p.proallargtypes,l.lanname,pg_get_functiondef(p.oid) definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
  WHERE n.nspname='public' AND p.proname=ANY(guarded_names) AND p.prokind='f'
    AND p.prosecdef AND p.prorettype<>'trigger'::regtype
    AND has_function_privilege('authenticated',p.oid,'EXECUTE')
 LOOP
  IF position('meta_reviewer_entry_guard_v1' IN f.prosrc)>0 THEN CONTINUE; END IF;
  definition:=f.definition;
  IF f.lanname='plpgsql' THEN
   -- Outer guard cannot be swallowed by an existing EXCEPTION WHEN OTHERS.
   -- Move compiler directives outside the nested original block, if present.
   SELECT coalesce(string_agg(m[1],E'\n'),'') INTO directives
    FROM regexp_matches(f.prosrc,'(^[[:blank:]]*#[^\n]+)','gn') m;
   body:=regexp_replace(f.prosrc,'^[[:blank:]]*#[^\n]+\n?','','gn');
   -- The outermost END may omit its terminator; a nested block may not.
   -- Normalize the existing terminator instead of producing END;; (PG rejects it).
   body:=regexp_replace(body,';[[:space:]]*$','');
   body:=directives||E'\nBEGIN'||guard||E'\n'||body||E';\nEND;\n';
  ELSIF f.lanname='sql' THEN
   body:=regexp_replace(btrim(f.prosrc),';[[:space:]]*$','');
   -- All audited SQL entries are single SELECT/WITH expressions. Fail closed on drift.
   IF body !~* '^[[:space:]]*(SELECT|WITH)\M' OR position(';' IN body)>0 THEN
    RAISE EXCEPTION 'Review SQL body before guarding RPC %',f.proname;
   END IF;
   IF f.proretset THEN
    -- SQL functions coerce declared output types; RETURN QUERY otherwise requires
    -- exact types (e.g. varchar vs text). Preserve that coercion by ordinal output.
    SELECT string_agg(format('q.%I::%s','c'||i,format_type(f.proallargtypes[i],NULL)),',' ORDER BY i),
      string_agg(quote_ident('c'||i),',' ORDER BY i)
     INTO columns,aliases FROM generate_subscripts(f.proallargtypes,1) i
     WHERE f.proargmodes[i] IN ('o','b','t');
    IF columns IS NULL THEN RAISE EXCEPTION 'Review SETOF output before guarding RPC %',f.proname; END IF;
    body:='SELECT '||columns||' FROM ('||body||') q('||aliases||')';
   END IF;
   body:=E'#variable_conflict use_column\nBEGIN'||guard||
    CASE WHEN f.proretset THEN E'\nRETURN QUERY '||body||E';\n'
     ELSE E'\nRETURN ('||body||E');\n' END||E'END;\n';
   definition:=regexp_replace(definition,'\mLANGUAGE sql\M','LANGUAGE plpgsql','i');
  ELSE
   RAISE EXCEPTION 'Unsupported audited RPC language: %',f.proname;
  END IF;
  EXECUTE replace(definition,f.prosrc,body);
 END LOOP;
END $migration$;
