CREATE OR REPLACE FUNCTION public.cordial_site_review_mark_decision()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $markdec$
BEGIN
 -- Só a revisão manual direta (cordial_site_review) conta como decisão; a
 -- sincronização disparada por outros gatilhos (profundidade > 1) nunca.
 IF pg_trigger_depth() = 1 AND NEW.reviewed_by IS NOT NULL AND auth.uid() IS NOT NULL AND auth.uid()=NEW.reviewed_by
    AND (TG_OP='INSERT' OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.state IS DISTINCT FROM OLD.state OR NEW.updated_at IS DISTINCT FROM OLD.updated_at) THEN
   NEW.own_decision := CASE WHEN NEW.state='published' THEN 'publish' ELSE 'withdraw' END;
   NEW.decision_by := NEW.reviewed_by;
   NEW.decision_at := now();
 END IF;
 RETURN NEW;
END $markdec$;