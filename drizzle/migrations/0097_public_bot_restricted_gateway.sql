-- Generated with drizzle-kit generate --custom; apply only through the Lovable connector.
-- A closed server-to-server gateway avoids a global Auth hook or service_role in the bot.
-- It is intentionally in the already-exposed public schema; the data schema stays private.
CREATE TABLE public_bot.gateway_credentials (
 key_hash bytea PRIMARY KEY CHECK(octet_length(key_hash)=32),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK(expires_at>created_at)
);
ALTER TABLE public_bot.gateway_credentials OWNER TO public_bot_owner;
ALTER TABLE public_bot.gateway_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_reviewer_block ON public_bot.gateway_credentials AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer());
CREATE POLICY atendimentos_viewer_block ON public_bot.gateway_credentials AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer());
REVOKE ALL ON public_bot.gateway_credentials FROM PUBLIC,anon,authenticated,service_role,public_bot_runtime;
GRANT SELECT(label,created_at,expires_at,revoked_at) ON public_bot.gateway_credentials TO service_role;
CREATE FUNCTION public_bot.gateway_authorize() RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public_bot AS $$
DECLARE secret text;
BEGIN
 secret:=current_setting('request.headers',true)::jsonb->>'x-public-bot-key';
 IF secret IS NULL OR octet_length(secret) NOT BETWEEN 32 AND 256 THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM public_bot.gateway_credentials WHERE key_hash=sha256(convert_to(secret,'UTF8')) AND expires_at>now() AND revoked_at IS NULL);
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
ALTER FUNCTION public_bot.gateway_authorize() OWNER TO public_bot_owner;
REVOKE ALL ON FUNCTION public_bot.gateway_authorize() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public_bot.gateway_authorize() TO public_bot_runtime;
--> statement-breakpoint
CREATE FUNCTION public.public_bot_gateway(op text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public_bot AS $$
DECLARE expected text[]; k text; text_value text;
BEGIN
 IF NOT public_bot.gateway_authorize() THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Unauthorized'; END IF;
 IF op IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR pg_column_size(payload)>32000 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
 expected:=CASE op
 WHEN 'configuration' THEN ARRAY['b'] WHEN 'facets' THEN ARRAY['b'] WHEN 'suggestion_set' THEN ARRAY['b']
 WHEN 'open_session' THEN ARRAY['b','token_hash','ip_key'] WHEN 'read_session' THEN ARRAY['b','token_hash']
 WHEN 'candidates' THEN ARRAY['b','f'] WHEN 'resolve' THEN ARRAY['b','ids']
 WHEN 'accept_turn' THEN ARRAY['b','token_hash','ip_key','local_day','request_id','expected_revision','fingerprint']
 WHEN 'complete_turn' THEN ARRAY['b','token_hash','request_id','result']
 WHEN 'reserve_cost' THEN ARRAY['b','token_hash','request_id']
 WHEN 'take_voice' THEN ARRAY['b','token_hash','ip_key','local_day','request_id','bytes','seconds']
 WHEN 'finish_voice' THEN ARRAY['b','token_hash','request_id','ok']
 WHEN 'event' THEN ARRAY['b','token_hash','event']
 WHEN 'usage' THEN ARRAY['b','request_id','model','latency','input_tokens','output_tokens','code']
 ELSE NULL END;
 IF expected IS NULL OR NOT payload ?& expected OR (SELECT count(*) FROM jsonb_object_keys(payload))<>cardinality(expected) OR coalesce(payload->>'b','') NOT IN ('cordial','morar') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
 FOREACH k IN ARRAY ARRAY['token_hash','ip_key','fingerprint'] LOOP
  IF payload ? k AND (jsonb_typeof(payload->k)<>'string' OR coalesce(payload->>k,'') !~ '^[a-f0-9]{64}$') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
 END LOOP;
 IF payload ? 'request_id' AND (jsonb_typeof(payload->'request_id')<>'string' OR coalesce(payload->>'request_id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
 IF payload ? 'local_day' AND (jsonb_typeof(payload->'local_day')<>'string' OR coalesce(payload->>'local_day','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
 FOREACH k IN ARRAY ARRAY['expected_revision','bytes','seconds','latency','input_tokens','output_tokens'] LOOP
  IF payload ? k AND (jsonb_typeof(payload->k)<>'number' OR coalesce(payload->>k,'') !~ '^[0-9]{1,9}$') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
 END LOOP;
 IF payload ? 'ok' AND jsonb_typeof(payload->'ok')<>'boolean' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
 FOREACH k IN ARRAY ARRAY['f','result','event'] LOOP
  IF payload ? k AND jsonb_typeof(payload->k) IS DISTINCT FROM 'object' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
 END LOOP;
 IF payload ? 'model' AND (jsonb_typeof(payload->'model') IS DISTINCT FROM 'string' OR coalesce(payload->>'model','') !~ '^[a-zA-Z0-9/_:.\-]{1,100}$') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
 IF payload ? 'code' AND (jsonb_typeof(payload->'code') IS DISTINCT FROM 'string' OR coalesce(payload->>'code','') !~ '^[a-z_]{1,40}$') THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
 IF payload ? 'ids' THEN
  IF jsonb_typeof(payload->'ids')<>'array' OR jsonb_array_length(payload->'ids')>200 THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
  FOR text_value IN SELECT value FROM jsonb_array_elements_text(payload->'ids') LOOP
   IF coalesce(text_value,'') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request'; END IF;
  END LOOP;
 END IF;
 -- Static names and typed arguments only; no SQL/name/URL chosen by the visitor or model.
 CASE op
 WHEN 'configuration' THEN RETURN public_bot.configuration(payload->>'b');
 WHEN 'facets' THEN RETURN public_bot.facets(payload->>'b');
 WHEN 'suggestion_set' THEN RETURN public_bot.suggestion_set(payload->>'b');
 WHEN 'open_session' THEN RETURN public_bot.open_session(payload->>'b',payload->>'token_hash',payload->>'ip_key');
 WHEN 'read_session' THEN RETURN public_bot.read_session(payload->>'b',payload->>'token_hash');
 WHEN 'candidates' THEN RETURN public_bot.candidates(payload->>'b',payload->'f');
 WHEN 'resolve' THEN RETURN public_bot.resolve(payload->>'b',ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(payload->'ids')));
 WHEN 'accept_turn' THEN RETURN public_bot.accept_turn(payload->>'b',payload->>'token_hash',payload->>'ip_key',(payload->>'local_day')::date,(payload->>'request_id')::uuid,(payload->>'expected_revision')::integer,payload->>'fingerprint');
 WHEN 'complete_turn' THEN RETURN to_jsonb(public_bot.complete_turn(payload->>'b',payload->>'token_hash',(payload->>'request_id')::uuid,payload->'result'));
 WHEN 'reserve_cost' THEN RETURN to_jsonb(public_bot.reserve_cost(payload->>'b',payload->>'token_hash',(payload->>'request_id')::uuid));
 WHEN 'take_voice' THEN RETURN public_bot.take_voice(payload->>'b',payload->>'token_hash',payload->>'ip_key',(payload->>'local_day')::date,(payload->>'request_id')::uuid,(payload->>'bytes')::integer,(payload->>'seconds')::integer);
 WHEN 'finish_voice' THEN RETURN to_jsonb(public_bot.finish_voice(payload->>'b',payload->>'token_hash',(payload->>'request_id')::uuid,(payload->>'ok')::boolean));
 WHEN 'event' THEN RETURN to_jsonb(public_bot.event(payload->>'b',payload->>'token_hash',payload->'event'));
 WHEN 'usage' THEN RETURN to_jsonb(public_bot.usage(payload->>'b',(payload->>'request_id')::uuid,payload->>'model',(payload->>'latency')::integer,(payload->>'input_tokens')::integer,(payload->>'output_tokens')::integer,payload->>'code'));
 END CASE;
EXCEPTION
 WHEN SQLSTATE 'PT401' THEN RAISE SQLSTATE 'PT401' USING MESSAGE='Unauthorized';
 WHEN OTHERS THEN RAISE SQLSTATE 'PT400' USING MESSAGE='Invalid request';
END $$;
-- ALTER OWNER requires CREATE for the new owner, even though it is revoked before commit.
-- Revoke while still the creating owner: default public-schema grants otherwise
-- retain the original grantor after ownership transfer on this managed database.
REVOKE ALL ON FUNCTION public.public_bot_gateway(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.public_bot_gateway(text,jsonb) TO anon;
GRANT USAGE,CREATE ON SCHEMA public TO public_bot_runtime;
ALTER FUNCTION public.public_bot_gateway(text,jsonb) OWNER TO public_bot_runtime;
REVOKE USAGE,CREATE ON SCHEMA public FROM public_bot_runtime;
-- This migration never populates a credential or changes the global PostgREST/Auth configuration.
DO $$ BEGIN
 IF has_schema_privilege('public_bot_runtime','public','USAGE') OR has_schema_privilege('public_bot_runtime','auth','USAGE') OR has_table_privilege('public_bot_runtime','public_bot.gateway_credentials','SELECT') OR has_function_privilege('authenticated','public.public_bot_gateway(text,jsonb)','EXECUTE') OR pg_has_role('public_bot_runtime','public_bot_owner','MEMBER') THEN RAISE EXCEPTION 'gateway privilege boundary changed'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
