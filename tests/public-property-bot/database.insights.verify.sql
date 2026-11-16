-- Read-only post-application checks. Execute exclusively through the Lovable connector.
-- No visitor text, hashes, IPs, tokens, user identities or provider content is returned.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'journal_entries',(SELECT count(*) FROM drizzle.__drizzle_migrations),
 'migration_matches',EXISTS(SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at=1794810273530 AND hash='f1eecee8700d9b26417e6f90f351ed49a83de4273784e681baaf8367ba4101c2'),
 'runtime_public_usage',has_schema_privilege('public_bot_runtime','public','USAGE'),
 'runtime_auth_usage',has_schema_privilege('public_bot_runtime','auth','USAGE'),
 'runtime_insights_select',has_table_privilege('public_bot_runtime','public_bot.insight_conversations','SELECT'),
 'runtime_insights_admin',has_function_privilege('public_bot_runtime','public.public_bot_insights(integer)','EXECUTE'),
 'runtime_reader_membership',pg_has_role('public_bot_runtime','public_bot_insights_reader','MEMBER'),
 'reader_public_usage',has_schema_privilege('public_bot_insights_reader','public','USAGE'),
 'reader_auth_usage',has_schema_privilege('public_bot_insights_reader','auth','USAGE'),
 'reader_properties_select',has_table_privilege('public_bot_insights_reader','public.properties','SELECT'),
 'reader_insights_select',has_table_privilege('public_bot_insights_reader','public_bot.insight_conversations','SELECT'),
 'reader_insights_update',has_table_privilege('public_bot_insights_reader','public_bot.insight_conversations','UPDATE'),
 'anonymous_admin_execute',has_function_privilege('anon','public.public_bot_insights(integer)','EXECUTE'),
 'authenticated_admin_execute',has_function_privilege('authenticated','public.public_bot_insights(integer)','EXECUTE'),
 'authenticated_direct_select',has_table_privilege('authenticated','public_bot.insight_conversations','SELECT'),
 'gateway_still_anonymous_execute',has_function_privilege('anon','public.public_bot_gateway(text,jsonb)','EXECUTE'),
 'gateway_not_employee_execute',NOT has_function_privilege('authenticated','public.public_bot_gateway(text,jsonb)','EXECUTE'),
 'tracking_since',(SELECT tracking_since FROM public_bot.insight_settings WHERE singleton),
 'rls_inventory',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'policies',(SELECT jsonb_agg(p.polname ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=c.oid)) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public_bot' AND c.relname IN ('insight_settings','insight_daily','insight_conversations','insight_events','insight_evolution')),
 'synthetic_credentials',(SELECT count(*) FROM public_bot.gateway_credentials WHERE label='synthetic-insights-gateway'),
 'synthetic_sessions',(SELECT count(*) FROM public_bot.sessions WHERE token_hash=repeat('a',64)),
 'synthetic_events',(SELECT count(*) FROM public_bot.insight_events WHERE event_id::text LIKE 'eeeeeeee-eeee-4eee-8eee-%'),
 'synthetic_conversations',(SELECT count(*) FROM public_bot.insight_conversations WHERE id IN ('eeeeeeee-eeee-4eee-8eee-000000000030','eeeeeeee-eeee-4eee-8eee-000000000031')),
 'synthetic_usage',(SELECT count(*) FROM public_bot.usage_data WHERE request_id::text LIKE 'eeeeeeee-eeee-4eee-8eee-%'),
 'public_documents',(SELECT count(*) FROM public_bot.search_documents)
) AS post_apply_insights;
ROLLBACK;
