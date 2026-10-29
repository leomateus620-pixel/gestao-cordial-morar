-- Bind only a directly verified advertiser account, atomically with the connection.
-- SHA-256 fingerprints are computed server-side from stored access credentials before
-- the provider proof; neither credential itself is passed as an RPC argument.
CREATE OR REPLACE FUNCTION public.ad_google_bind_account(
 p_connection_id uuid, p_imobiliaria text, p_external_account_id text,
 p_name text, p_currency text, p_timezone text,
 p_encrypted_access_hash text, p_plain_access_hash text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE c public.ad_platform_connections; v_account_id uuid;
BEGIN
 IF p_imobiliaria IS NULL OR p_imobiliaria NOT IN ('cordial','morar')
    OR p_external_account_id IS NULL OR p_external_account_id !~ '^[0-9]{10}$'
    OR (p_name IS NOT NULL AND length(p_name)>255)
    OR (p_currency IS NOT NULL AND p_currency !~ '^[A-Z]{3}$')
    OR (p_timezone IS NOT NULL AND length(p_timezone)>100)
    OR (p_encrypted_access_hash IS NOT NULL AND p_encrypted_access_hash !~ '^[0-9a-f]{64}$')
    OR (p_plain_access_hash IS NOT NULL AND p_plain_access_hash !~ '^[0-9a-f]{64}$') THEN
   RAISE EXCEPTION 'Invalid account binding';
 END IF;
 SELECT * INTO c FROM public.ad_platform_connections WHERE id=p_connection_id FOR UPDATE;
 IF c.id IS NULL OR c.platform IS DISTINCT FROM 'google' OR c.imobiliaria IS DISTINCT FROM p_imobiliaria THEN
   RAISE EXCEPTION 'Connection outside account scope';
 END IF;
 IF (CASE WHEN c.encrypted_access_token IS NULL THEN NULL ELSE encode(sha256(convert_to(c.encrypted_access_token,'UTF8')),'hex') END) IS DISTINCT FROM p_encrypted_access_hash
 OR (CASE WHEN c.access_token IS NULL THEN NULL ELSE encode(sha256(convert_to(c.access_token,'UTF8')),'hex') END) IS DISTINCT FROM p_plain_access_hash
 OR (c.encrypted_access_token IS NULL AND c.access_token IS NULL) THEN
   RAISE EXCEPTION 'Connection changed during account verification';
 END IF;
 IF c.external_account_id IS NOT NULL AND replace(c.external_account_id,'-','') IS DISTINCT FROM p_external_account_id THEN
   RAISE EXCEPTION 'Connection already bound to another account';
 END IF;
 IF EXISTS(SELECT 1 FROM public.ad_accounts WHERE connection_id=c.id AND (platform IS DISTINCT FROM 'google' OR external_account_id IS DISTINCT FROM p_external_account_id)) THEN
   RAISE EXCEPTION 'Connection has another account';
 END IF;
 INSERT INTO public.ad_accounts(connection_id,platform,external_account_id,name,currency,timezone)
 VALUES(c.id,'google',p_external_account_id,p_name,p_currency,p_timezone)
 ON CONFLICT(connection_id,external_account_id) DO UPDATE SET name=excluded.name,currency=excluded.currency,timezone=excluded.timezone
 WHERE public.ad_accounts.platform='google'
 RETURNING id INTO v_account_id;
 IF v_account_id IS NULL THEN RAISE EXCEPTION 'Incompatible account'; END IF;
 UPDATE public.ad_platform_connections SET external_account_id=p_external_account_id,account_label=p_name,status='connected',last_error=NULL WHERE id=c.id;
 RETURN v_account_id;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.ad_google_bind_account(uuid,text,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.ad_google_bind_account(uuid,text,text,text,text,text,text,text) TO service_role;
