CREATE OR REPLACE FUNCTION public.imobi_off_park_sync_job()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $imoff$
BEGIN
 -- Imobi OFF: todo trabalho externo novo nasce estacionado, com motivo auditável.
 IF coalesce((SELECT value::text FROM app_settings WHERE key='imobi_integration_state'),'"off"') <> '"on"' AND NEW.status IN ('pending','retry','processing') THEN
   NEW.status := 'cancelled';
   NEW.last_error_category := 'imobi_off';
   NEW.last_error_message := 'Integração ImobiBrasil desligada (Imobi OFF) — estacionado sem envio';
   NEW.locked_at := NULL; NEW.lock_expires_at := NULL; NEW.locked_by := NULL; NEW.lease_token := NULL;
   NEW.finished_at := coalesce(NEW.finished_at, now());
 END IF;
 RETURN NEW;
END $imoff$;

DROP TRIGGER IF EXISTS imobi_off_park_sync_job ON public.property_sync_jobs;
CREATE TRIGGER imobi_off_park_sync_job BEFORE INSERT OR UPDATE OF status ON public.property_sync_jobs
 FOR EACH ROW EXECUTE FUNCTION public.imobi_off_park_sync_job();