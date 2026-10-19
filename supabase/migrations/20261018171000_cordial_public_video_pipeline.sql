-- Additive publication sidecar. Original uploads and commercial records are unchanged.
-- A real media processor must claim, sanitize/transcode and finish each job before review.
BEGIN;
CREATE TABLE public.cordial_site_video_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 video_id uuid NOT NULL UNIQUE REFERENCES public.property_videos(id) ON DELETE CASCADE,
 source_signature text NOT NULL,
 state text NOT NULL DEFAULT 'uploaded' CHECK(state IN ('uploaded','processing','ready','error')),
 processing_token uuid,
 processing_until timestamptz,
 output_version text,
 processed_storage_path text,
 width integer,
 height integer,
 duration_seconds numeric,
 size_bytes bigint,
 approved boolean NOT NULL DEFAULT false,
 reviewed_by uuid REFERENCES auth.users(id),
 error_code text CHECK(error_code IS NULL OR error_code IN ('unsupported','too_large','too_long','processing_failed')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(state<>'ready' OR (processed_storage_path IS NOT NULL AND processed_storage_path!~'(^https?:|\.\.)' AND output_version IS NOT NULL AND output_version ~ '^[a-f0-9]{32}$' AND width IS NOT NULL AND width>0 AND width<=7680 AND height IS NOT NULL AND height>0 AND height<=7680 AND duration_seconds IS NOT NULL AND duration_seconds>0 AND duration_seconds<=180 AND size_bytes IS NOT NULL AND size_bytes>0 AND size_bytes<=157286400))
);
ALTER TABLE public.cordial_site_video_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cordial_site_video_assets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cordial_site_video_assets TO authenticated;
GRANT ALL ON public.cordial_site_video_assets TO service_role;
CREATE POLICY cordial_video_admin ON public.cordial_site_video_assets FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE TRIGGER site_video_audit AFTER INSERT OR UPDATE OR DELETE ON public.cordial_site_video_assets FOR EACH ROW EXECUTE FUNCTION public.cordial_site_audit_change();
CREATE FUNCTION public.cordial_site_video_signature(v public.property_videos) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT md5(jsonb_build_array(v.storage_path,v.checksum,v.updated_at,v.upload_status)::text) $$;
CREATE FUNCTION public.cordial_site_prepare_video(_video_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v property_videos; result uuid;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 SELECT * INTO v FROM property_videos WHERE id=_video_id;
 IF v.id IS NULL OR v.upload_status<>'ready' OR v.storage_path~'(^https?:|\.\.)' THEN RAISE EXCEPTION 'video_unavailable'; END IF;
 IF v.size_bytes IS NULL OR v.size_bytes<=0 OR v.size_bytes>157286400 THEN RAISE EXCEPTION 'video_too_large'; END IF;
 IF v.mime_type IS NULL OR v.mime_type NOT IN ('video/mp4','video/webm','video/quicktime') THEN RAISE EXCEPTION 'unsupported_video'; END IF;
 INSERT INTO cordial_site_video_assets(video_id,source_signature) VALUES(v.id,cordial_site_video_signature(v))
 ON CONFLICT(video_id) DO UPDATE SET source_signature=excluded.source_signature,state='uploaded',approved=false,processed_storage_path=NULL,output_version=NULL,processing_token=NULL,processing_until=NULL,error_code=NULL,updated_at=now()
 WHERE cordial_site_video_assets.source_signature<>excluded.source_signature OR cordial_site_video_assets.state='error'
 RETURNING id INTO result;
 RETURN coalesce(result,(SELECT id FROM cordial_site_video_assets WHERE video_id=v.id));
END $$;
CREATE FUNCTION public.cordial_site_claim_video() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a cordial_site_video_assets; token uuid:=gen_random_uuid();
BEGIN
 SELECT * INTO a FROM cordial_site_video_assets WHERE state='uploaded' OR (state='processing' AND processing_until<now()) ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE cordial_site_video_assets SET state='processing',processing_token=token,processing_until=now()+interval '10 minutes',updated_at=now() WHERE id=a.id;
 RETURN (SELECT jsonb_build_object('id',a.id,'token',token,'storagePath',v.storage_path,'sourceSignature',a.source_signature,'maxBytes',157286400,'maxDurationSeconds',180) FROM property_videos v WHERE v.id=a.video_id);
END $$;
CREATE FUNCTION public.cordial_site_finish_video(_id uuid,_token uuid,_report jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a cordial_site_video_assets; v property_videos;
BEGIN
 SELECT * INTO a FROM cordial_site_video_assets WHERE id=_id FOR UPDATE;
 IF NOT FOUND OR a.state<>'processing' OR a.processing_token IS DISTINCT FROM _token OR a.processing_until<now() THEN RETURN false; END IF;
 SELECT * INTO v FROM property_videos WHERE id=a.video_id;
 IF a.source_signature IS DISTINCT FROM cordial_site_video_signature(v) THEN RETURN false; END IF;
 IF _report->>'error' IS NOT NULL THEN
  UPDATE cordial_site_video_assets SET state='error',error_code=_report->>'error',approved=false,processing_until=NULL,updated_at=now() WHERE id=a.id;
  RETURN true;
 END IF;
 IF (_report->>'mime') IS DISTINCT FROM 'video/mp4' OR (_report->>'videoCodec') IS DISTINCT FROM 'h264' OR coalesce(_report->>'audioCodec','none') NOT IN ('aac','none') OR (_report->>'metadataRemoved') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'invalid_video_report'; END IF;
 IF _report->>'path' NOT LIKE 'cordial-site/%' THEN RAISE EXCEPTION 'invalid_video_path'; END IF;
 UPDATE cordial_site_video_assets SET state='ready',processed_storage_path=_report->>'path',output_version=_report->>'version',width=(_report->>'width')::int,height=(_report->>'height')::int,duration_seconds=(_report->>'duration')::numeric,size_bytes=(_report->>'bytes')::bigint,approved=false,processing_until=NULL,error_code=NULL,updated_at=now() WHERE id=a.id;
 RETURN true;
END $$;
CREATE FUNCTION public.cordial_site_review_video(_id uuid,_approve boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE cordial_site_video_assets a SET approved=_approve,reviewed_by=auth.uid(),updated_at=now()
 FROM property_videos v WHERE a.id=_id AND v.id=a.video_id AND a.state='ready' AND a.source_signature=cordial_site_video_signature(v);
 RETURN FOUND;
END $$;
CREATE VIEW public.cordial_site_authorized_videos WITH(security_invoker=true) AS
 SELECT a.id,e.public_id,a.output_version AS version,a.processed_storage_path AS storage_path,a.width,a.height,a.duration_seconds AS duration,a.size_bytes
 FROM cordial_site_video_assets a JOIN property_videos v ON v.id=a.video_id JOIN cordial_site_eligible e ON e.property_id=v.property_id
 WHERE a.state='ready' AND a.approved AND a.reviewed_by IS NOT NULL AND v.upload_status='ready' AND a.source_signature=cordial_site_video_signature(v);
REVOKE ALL ON public.cordial_site_authorized_videos FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cordial_site_authorized_videos TO service_role;
REVOKE ALL ON FUNCTION public.cordial_site_prepare_video(uuid),public.cordial_site_review_video(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cordial_site_prepare_video(uuid),public.cordial_site_review_video(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.cordial_site_video_signature(public.property_videos),public.cordial_site_claim_video(),public.cordial_site_finish_video(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cordial_site_video_signature(public.property_videos),public.cordial_site_claim_video(),public.cordial_site_finish_video(uuid,uuid,jsonb) TO service_role;
COMMIT;
