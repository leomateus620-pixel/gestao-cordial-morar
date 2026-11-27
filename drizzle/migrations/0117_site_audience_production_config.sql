CREATE TABLE site_audience.production_notices (
  brand text NOT NULL CHECK (brand IN ('cordial', 'morar')),
  policy_version text NOT NULL CHECK (policy_version ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  notice text NOT NULL CHECK (char_length(notice) BETWEEN 80 AND 2000),
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (brand, policy_version)
);

CREATE TABLE site_audience.production_config (
  brand text PRIMARY KEY CHECK (brand IN ('cordial', 'morar')),
  policy_version text NOT NULL,
  secret_id uuid NOT NULL,
  enabled boolean NOT NULL,
  ingress_verified_at timestamptz NOT NULL,
  utm_pairs jsonb NOT NULL DEFAULT '[]',
  campaigns text[] NOT NULL DEFAULT '{}',
  referrers text[] NOT NULL DEFAULT '{}',
  FOREIGN KEY (brand, policy_version) REFERENCES site_audience.production_notices(brand, policy_version)
);

DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['production_notices', 'production_config'] LOOP
    EXECUTE format('ALTER TABLE site_audience.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY meta_reviewer_block ON site_audience.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer())', relation);
    EXECUTE format('CREATE POLICY atendimentos_viewer_block ON site_audience.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer())', relation);
    EXECUTE format('REVOKE ALL ON site_audience.%I FROM PUBLIC, anon, authenticated, service_role', relation);
  END LOOP;
END $$;

CREATE FUNCTION site_audience.require_approved_production_coverage()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, site_audience AS $$
BEGIN
  IF NEW.environment = 'production' AND NEW.ended_at IS NULL AND NOT EXISTS (
    SELECT FROM site_audience.production_config c WHERE c.brand = NEW.brand
      AND c.policy_version = NEW.policy_version AND c.enabled
  ) THEN
    RAISE EXCEPTION 'Production coverage requires an approved audience configuration'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER site_audience_approved_production_coverage
  BEFORE INSERT OR UPDATE OF ended_at, policy_version, brand, environment ON site_audience.coverage
  FOR EACH ROW EXECUTE FUNCTION site_audience.require_approved_production_coverage();
REVOKE ALL ON FUNCTION site_audience.require_approved_production_coverage() FROM PUBLIC, anon, authenticated, service_role;

--> statement-breakpoint
-- Production activation is an explicit service operation. Neither a migration nor
-- a preview creates a notice, a Vault secret, or a coverage window.
CREATE FUNCTION public.site_audience_production_configure(
  p_brand text,
  p_enabled boolean,
  p_policy_version text DEFAULT NULL,
  p_notice text DEFAULT NULL,
  p_ingress_verified boolean DEFAULT false,
  p_utm_pairs jsonb DEFAULT '[]',
  p_campaigns text[] DEFAULT '{}',
  p_referrers text[] DEFAULT '{}'
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, site_audience AS $$
DECLARE supplied_notice text := btrim(p_notice);
DECLARE recorded_notice text;
DECLARE secret_ref uuid;
DECLARE utm_label constant text := '^[a-z][a-z0-9]*([-_][a-z0-9]+)*$';
DECLARE referrer_domain constant text := '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$';
BEGIN
  IF coalesce(p_brand,'') NOT IN ('cordial','morar') OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Invalid audience production configuration' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('site-audience:' || p_brand || ':production'));

  IF NOT p_enabled THEN
    UPDATE site_audience.production_config SET enabled = false WHERE brand = p_brand;
    PERFORM public.site_audience_configure(p_brand, 'production', NULL, false);
    RETURN;
  END IF;

  IF p_ingress_verified IS DISTINCT FROM true
    OR coalesce(p_policy_version,'') !~ '^[a-z0-9][a-z0-9_-]{0,39}$'
    OR coalesce(char_length(supplied_notice),0) NOT BETWEEN 80 AND 2000
    OR jsonb_typeof(p_utm_pairs) IS DISTINCT FROM 'array'
    OR coalesce(cardinality(p_campaigns),101) > 100
    OR coalesce(cardinality(p_referrers),101) > 100
  THEN RAISE EXCEPTION 'Approved notice and verified production ingress are required' USING ERRCODE = '22023'; END IF;

  IF jsonb_array_length(p_utm_pairs) > 100
    OR EXISTS (
      SELECT FROM jsonb_array_elements(p_utm_pairs) pair
      WHERE CASE WHEN jsonb_typeof(pair) <> 'object' THEN true ELSE
        NOT pair ?& ARRAY['source','medium'] OR (pair - ARRAY['source','medium']) <> '{}'::jsonb
        OR jsonb_typeof(pair->'source') IS DISTINCT FROM 'string'
        OR jsonb_typeof(pair->'medium') IS DISTINCT FROM 'string'
        OR char_length(pair->>'source') > 48 OR pair->>'source' !~ utm_label
        OR char_length(pair->>'medium') > 48 OR pair->>'medium' !~ utm_label
      END
    )
    OR EXISTS (SELECT FROM unnest(p_campaigns) item
      WHERE item IS NULL OR char_length(item) > 48 OR item !~ utm_label)
    OR EXISTS (SELECT FROM unnest(p_referrers) item
      WHERE item IS NULL OR char_length(item) > 80 OR item !~ referrer_domain)
  THEN RAISE EXCEPTION 'Invalid audience production attribution allowlist' USING ERRCODE = '22023'; END IF;

  SELECT n.notice INTO recorded_notice FROM site_audience.production_notices n
    WHERE n.brand = p_brand AND n.policy_version = p_policy_version;
  IF FOUND AND recorded_notice <> supplied_notice THEN
    RAISE EXCEPTION 'Editing an approved notice requires a new policy version' USING ERRCODE = '22023';
  END IF;
  INSERT INTO site_audience.production_notices(brand,policy_version,notice)
    VALUES(p_brand,p_policy_version,supplied_notice) ON CONFLICT DO NOTHING;

  SELECT c.secret_id INTO secret_ref FROM site_audience.production_config c WHERE c.brand = p_brand;
  IF NOT FOUND THEN
    SELECT vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'site-audience-production-' || p_brand,
      'HMAC for audience rate windows and form receipts for ' || p_brand,
      NULL
    ) INTO secret_ref;
  END IF;

  INSERT INTO site_audience.production_config(brand,policy_version,secret_id,enabled,ingress_verified_at,utm_pairs,campaigns,referrers)
    VALUES(p_brand,p_policy_version,secret_ref,true,clock_timestamp(),p_utm_pairs,p_campaigns,p_referrers)
    ON CONFLICT (brand) DO UPDATE SET policy_version=EXCLUDED.policy_version, enabled=true,
      ingress_verified_at=EXCLUDED.ingress_verified_at, utm_pairs=EXCLUDED.utm_pairs,
      campaigns=EXCLUDED.campaigns, referrers=EXCLUDED.referrers;

  PERFORM public.site_audience_configure(p_brand,'production',p_policy_version,true);
END $$;

-- The worker already holds the service role, and only this narrow reader resolves a
-- single audience secret. The browser gets a separate allowlisted projection.
CREATE FUNCTION public.site_audience_production_settings(p_brand text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, site_audience AS $$
DECLARE worker_config jsonb;
BEGIN
  IF coalesce(p_brand,'') NOT IN ('cordial','morar') THEN RETURN NULL; END IF;
  SELECT jsonb_build_object('policyVersion',c.policy_version,'notice',n.notice,
    'pairs',c.utm_pairs,'campaigns',c.campaigns,'referrers',c.referrers,'secret',v.decrypted_secret)
    INTO worker_config
  FROM site_audience.production_config c
  JOIN site_audience.production_notices n USING (brand,policy_version)
  JOIN vault.decrypted_secrets v ON v.id = c.secret_id
  WHERE c.brand = p_brand AND c.enabled
    AND public.site_audience_collection_status(p_brand,'production',c.policy_version);
  RETURN worker_config;
END $$;

REVOKE ALL ON FUNCTION public.site_audience_production_configure(text,boolean,text,text,boolean,jsonb,text[],text[]),
  public.site_audience_production_settings(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_audience_production_configure(text,boolean,text,text,boolean,jsonb,text[],text[]),
  public.site_audience_production_settings(text) TO service_role;
