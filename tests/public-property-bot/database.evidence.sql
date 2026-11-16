-- Synthetic expressions/state only. Run through Lovable inside BEGIN ... ROLLBACK after 0096.
DO $$ DECLARE item jsonb; got jsonb; BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements('[
  ["",["Não há piscina"],"piscina","private","absent"],
  ["",["Não dispõe de piscina"],"piscina","private","absent"],
  ["",["Piscina inexistente"],"piscina","private","absent"],
  ["Não há informação de piscina",[],"piscina","private","unknown"],
  ["Espaço para construir piscina",[],"piscina","private","unknown"],
  ["Piscina privativa e churrasqueira no condomínio",[],"piscina","private","present"],
  ["Piscina privativa e churrasqueira no condomínio",[],"piscina","condominium","unknown"],
  ["Piscina privativa e churrasqueira no condomínio",[],"churrasqueira","condominium","present"],
  ["Piscina privativa, churrasqueira no condomínio",[],"piscina","private","present"],
  ["Condomínio com piscina e churrasqueira",[],"churrasqueira","private","unknown"],
  ["Condomínio com piscina e churrasqueira",[],"piscina","condominium","present"],
  ["Casa em condomínio com piscina privativa",[],"piscina","private","present"],
  ["Casa com salão",[],"sala","private","unknown"]
 ]'::jsonb) LOOP
  got:=public_bot.feature(jsonb_build_object('description',item->>0,'features',item->1),item->>2,item->>3);
  IF got->>'state' IS DISTINCT FROM item->>4 THEN RAISE EXCEPTION 'feature evidence mismatch: %',item; END IF;
 END LOOP;
END $$;
DO $$ DECLARE opened jsonb; req uuid:='bbbbbbbb-bbbb-4bbb-8bbb-000000000001'; sid uuid; result jsonb; BEGIN
 opened:=public_bot.open_session('cordial',repeat('6',64),repeat('7',64));
 IF opened->>'exhausted' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'new IP starts exhausted'; END IF;
 INSERT INTO public_bot.daily_quotas(ip_key,local_day,accepted) VALUES(repeat('7',64),(now() AT TIME ZONE 'America/Sao_Paulo')::date,25);
 IF public_bot.open_session('cordial',repeat('6',64),repeat('7',64))->>'exhausted' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'reopen hid exhausted quota'; END IF;
 IF public_bot.open_session('morar',repeat('0',64),repeat('7',64))->>'exhausted' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'other brand reset exhausted quota'; END IF;
 -- A different daily HMAC key has no inherited quota; the clock/key policy is tested in quota.server.
 IF public_bot.open_session('cordial',repeat('6',64),repeat('e',64))->>'exhausted' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'renewed daily key inherited exhausted quota'; END IF;
 sid:=(opened->>'id')::uuid;
 result:=public_bot.take_voice('cordial',repeat('6',64),repeat('7',64),(now() AT TIME ZONE 'America/Sao_Paulo')::date,req,1000,60);
 IF result->>'state'<>'accepted' THEN RAISE EXCEPTION 'synthetic voice reservation failed'; END IF;
 UPDATE public_bot.voice_requests SET lease_until=now()-interval '1 second' WHERE session_id=sid AND request_id=req;
 IF public_bot.finish_voice('cordial',repeat('6',64),req,true) THEN RAISE EXCEPTION 'expired voice response reported success'; END IF;
 IF (SELECT voice_reserved FROM public_bot.daily_quotas WHERE ip_key=repeat('7',64) AND local_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date)<>0 THEN RAISE EXCEPTION 'expired voice slot not released'; END IF;
 IF (SELECT voices FROM public_bot.daily_quotas WHERE ip_key=repeat('7',64) AND local_day=(now() AT TIME ZONE 'America/Sao_Paulo')::date)<>0 THEN RAISE EXCEPTION 'expired voice incorrectly counted success'; END IF;
END $$;
SELECT jsonb_build_object('feature_matrix_13','passed','reopen_exhausted','passed','cross_brand_exhausted','passed','new_day_key','passed','expired_voice_lease','passed','transaction','ROLLBACK required') AS evidence_integration;
