-- Read-only bounded EXPLAINs, no visitor rows or JWT identities printed.
-- Execute each EXPLAIN separately if the connector returns only its last result set.
-- Keep BEGIN/claims/ROLE/ROLLBACK around each run in that case.
BEGIN READ ONLY;
DO $$ DECLARE aid uuid; BEGIN
 SELECT user_id INTO aid FROM public.user_roles WHERE role='admin' AND public.has_role(user_id,'admin') LIMIT 1;
 IF aid IS NULL THEN RAISE EXCEPTION 'No authorized admin identity available for read-only EXPLAIN'; END IF;
 PERFORM set_config('request.jwt.claim.sub',aid::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',aid,'role','authenticated')::text,true);
END $$;
SET LOCAL ROLE authenticated;
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT public.public_bot_insights(7);
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT public.public_bot_insights(30);
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT public.public_bot_conversations('cordial',30,1,25);
RESET ROLE;
ROLLBACK;
