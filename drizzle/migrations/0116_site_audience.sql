CREATE SCHEMA site_audience;
REVOKE ALL ON SCHEMA site_audience FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE site_audience.coverage (
  brand text NOT NULL CHECK (brand IN ('cordial', 'morar')),
  environment text NOT NULL CHECK (environment IN ('production', 'qa')),
  policy_version text NOT NULL CHECK (policy_version ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz CHECK (ended_at >= started_at),
  PRIMARY KEY (brand, environment, started_at)
);
CREATE UNIQUE INDEX site_audience_one_open_window
  ON site_audience.coverage (brand, environment) WHERE ended_at IS NULL;

CREATE TABLE site_audience.sessions (
  brand text NOT NULL CHECK (brand IN ('cordial', 'morar')),
  environment text NOT NULL CHECK (environment IN ('production', 'qa')),
  id uuid NOT NULL,
  visitor_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  last_activity_at timestamptz NOT NULL,
  measurable_activity boolean NOT NULL,
  entry_page text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('organic', 'paid', 'social', 'referral', 'direct', 'campaign')),
  source text CHECK (length(source) <= 80),
  medium text CHECK (length(medium) <= 40),
  campaign text CHECK (length(campaign) <= 60),
  event_count integer NOT NULL DEFAULT 0 CHECK (event_count BETWEEN 0 AND 1800),
  PRIMARY KEY (brand, environment, id)
);
CREATE INDEX site_audience_sessions_retention ON site_audience.sessions (last_activity_at);
CREATE INDEX site_audience_sessions_visitor ON site_audience.sessions (brand, environment, visitor_id, id);

CREATE TABLE site_audience.events (
  brand text NOT NULL,
  environment text NOT NULL,
  session_id uuid NOT NULL,
  id uuid NOT NULL,
  sequence bigint GENERATED ALWAYS AS IDENTITY,
  happened_at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'session_start', 'page_view', 'menu_click', 'property_click', 'property_view',
    'quick_view', 'active_time', 'search', 'whatsapp_click', 'form_received'
  )),
  page text NOT NULL CHECK (page IN (
    'home', 'buy', 'rent', 'search', 'districts', 'news', 'contact', 'advertise',
    'property', 'favorites', 'selection', 'about', 'financing', 'correspondent', 'privacy', 'information'
  )),
  property_id uuid,
  menu text,
  placement text,
  active_seconds integer CHECK (active_seconds BETWEEN 1 AND 15),
  is_reload boolean NOT NULL DEFAULT false,
  PRIMARY KEY (brand, environment, id),
  FOREIGN KEY (brand, environment, session_id)
    REFERENCES site_audience.sessions (brand, environment, id) ON DELETE CASCADE
);
CREATE INDEX site_audience_events_range ON site_audience.events (brand, environment, happened_at);
CREATE INDEX site_audience_page_range ON site_audience.events (brand, environment, happened_at)
  INCLUDE (session_id) WHERE kind = 'page_view';
CREATE INDEX site_audience_events_session ON site_audience.events (brand, environment, session_id, sequence);
CREATE INDEX site_audience_events_retention ON site_audience.events (happened_at);
CREATE INDEX site_audience_property_history
  ON site_audience.events (brand, environment, session_id, property_id, happened_at, sequence)
  WHERE kind = 'property_view';

-- Abuse counters are separate from measurement and hold only short-lived rotating HMACs.
CREATE TABLE site_audience.rate_windows (
  brand text NOT NULL,
  environment text NOT NULL,
  bucket text NOT NULL CHECK (bucket ~ '^[a-f0-9]{64}$'),
  slot timestamptz NOT NULL,
  requests integer NOT NULL,
  events integer NOT NULL,
  PRIMARY KEY (brand, environment, bucket, slot)
);
CREATE INDEX site_audience_rate_retention ON site_audience.rate_windows (slot);

REVOKE ALL ON ALL TABLES IN SCHEMA site_audience FROM PUBLIC, anon, authenticated, service_role;
DO $$
DECLARE relation text;
BEGIN
  FOREACH relation IN ARRAY ARRAY['coverage', 'sessions', 'events', 'rate_windows'] LOOP
    EXECUTE format('ALTER TABLE site_audience.%I ENABLE ROW LEVEL SECURITY', relation);
    EXECUTE format('CREATE POLICY meta_reviewer_block ON site_audience.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_meta_reviewer()) WITH CHECK (NOT public.is_meta_reviewer())', relation);
    EXECUTE format('CREATE POLICY atendimentos_viewer_block ON site_audience.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_atendimentos_viewer()) WITH CHECK (NOT public.is_atendimentos_viewer())', relation);
  END LOOP;
END $$;

--> statement-breakpoint
CREATE FUNCTION public.site_audience_configure(
  p_brand text, p_environment text, p_policy_version text, p_enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, site_audience AS $$
DECLARE current_window site_audience.coverage;
DECLARE changed_at timestamptz;
BEGIN
  IF p_brand IS NULL OR p_brand NOT IN ('cordial', 'morar')
    OR p_environment IS NULL OR p_environment NOT IN ('production', 'qa')
    OR p_enabled IS NULL OR (p_enabled AND coalesce(p_policy_version, '') !~ '^[a-z0-9][a-z0-9_-]{0,39}$')
  THEN
    RAISE EXCEPTION 'Invalid audience configuration' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('site-audience:' || p_brand || ':' || p_environment));
  SELECT * INTO current_window FROM site_audience.coverage
    WHERE brand = p_brand AND environment = p_environment AND ended_at IS NULL
    FOR UPDATE;
  IF p_enabled AND current_window.policy_version = p_policy_version THEN
    RETURN;
  END IF;
  changed_at := clock_timestamp();
  UPDATE site_audience.coverage SET ended_at = changed_at
    WHERE brand = p_brand AND environment = p_environment AND ended_at IS NULL;
  IF p_enabled THEN
    INSERT INTO site_audience.coverage (brand, environment, policy_version, started_at)
      VALUES (p_brand, p_environment, p_policy_version, changed_at);
  END IF;
END $$;

CREATE FUNCTION public.site_audience_collection_status(
  p_brand text, p_environment text, p_policy_version text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, site_audience AS $$
  SELECT EXISTS (
    SELECT FROM site_audience.coverage WHERE brand = p_brand AND environment = p_environment
      AND ended_at IS NULL AND policy_version = p_policy_version
  )
$$;

CREATE FUNCTION public.site_audience_ingest(
  p_brand text, p_environment text, p_policy_version text, p_bucket text,
  p_session_id uuid, p_visitor_id uuid, p_events jsonb,
  p_channel text, p_source text, p_medium text, p_campaign text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, site_audience AS $$
DECLARE captured_at timestamptz := statement_timestamp();
DECLARE slot_start timestamptz := date_bin(interval '15 minutes', captured_at, '2000-01-01 UTC'::timestamptz);
DECLARE current_session site_audience.sessions;
DECLARE first_event jsonb;
DECLARE request_count integer;
DECLARE submitted_count integer;
DECLARE inserted_count integer;
BEGIN
  IF p_brand IS NULL OR p_brand NOT IN ('cordial', 'morar')
    OR p_environment IS NULL OR p_environment NOT IN ('production', 'qa')
    OR p_session_id IS NULL OR p_visitor_id IS NULL OR coalesce(p_bucket, '') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR pg_column_size(p_events) > 12000
  THEN RETURN 'invalid'; END IF;
  IF jsonb_array_length(p_events) NOT BETWEEN 1 AND 20 THEN RETURN 'invalid'; END IF;

  -- Hold the coverage row for this transaction so a completed deactivation cannot admit more writes.
  PERFORM 1 FROM site_audience.coverage WHERE brand = p_brand AND environment = p_environment
    AND ended_at IS NULL AND policy_version = p_policy_version FOR SHARE;
  IF NOT FOUND THEN RETURN 'disabled'; END IF;

  INSERT INTO site_audience.rate_windows AS rate (brand, environment, bucket, slot, requests, events)
    VALUES (p_brand, p_environment, p_bucket, slot_start, 1, jsonb_array_length(p_events))
  ON CONFLICT (brand, environment, bucket, slot) DO UPDATE
    SET requests = least(601, rate.requests + 1), events = least(2401, rate.events + EXCLUDED.events)
  RETURNING requests, events INTO request_count, submitted_count;
  IF request_count > 600 OR submitted_count > 2400 THEN RETURN 'limited'; END IF;

  SELECT * INTO current_session FROM site_audience.sessions
    WHERE brand = p_brand AND environment = p_environment AND id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    first_event := p_events->0;
    IF first_event->>'kind' IS DISTINCT FROM 'session_start' THEN RETURN 'missing_session'; END IF;
    INSERT INTO site_audience.sessions (brand, environment, id, visitor_id, started_at, last_activity_at,
      measurable_activity, entry_page, channel, source, medium, campaign)
    VALUES (p_brand, p_environment, p_session_id, p_visitor_id, captured_at, captured_at,
      coalesce((first_event->>'measurableActivity')::boolean, false), first_event->>'page',
      coalesce(p_channel, 'direct'), p_source, p_medium, p_campaign)
    ON CONFLICT (brand, environment, id) DO NOTHING;
    SELECT * INTO current_session FROM site_audience.sessions
      WHERE brand = p_brand AND environment = p_environment AND id = p_session_id FOR UPDATE;
  END IF;
  IF current_session.visitor_id <> p_visitor_id THEN RETURN 'invalid'; END IF;
  IF current_session.last_activity_at < captured_at - interval '30 minutes'
    OR current_session.started_at < captured_at - interval '24 hours'
  THEN RETURN 'expired_session'; END IF;

  -- Accept the event's public ID only while it belongs to the visible catalog of this brand.
  -- The report retains previously valid counts after withdrawal with catalog presentation removed.
  WITH candidates AS (
    SELECT value AS event, ordinality,
      nullif(value->>'propertyId', '')::uuid AS property_id
    FROM jsonb_array_elements(p_events) WITH ORDINALITY
    WHERE value->>'kind' <> 'session_start' OR (current_session.event_count = 0 AND ordinality = 1)
  ), checked AS (
    SELECT * FROM candidates c WHERE c.property_id IS NULL OR
      CASE p_brand WHEN 'cordial' THEN EXISTS (
        SELECT FROM public.cordial_site_eligible e WHERE e.public_id = c.property_id
      ) ELSE EXISTS (
        SELECT FROM public.morar_site_eligible e WHERE e.public_id = c.property_id
      ) END
  )
  INSERT INTO site_audience.events (brand, environment, session_id, id, happened_at, kind, page,
    property_id, menu, placement, active_seconds, is_reload)
  SELECT p_brand, p_environment, p_session_id, (event->>'id')::uuid, captured_at, event->>'kind',
    event->>'page', property_id, event->>'menu', event->>'placement',
    (event->>'activeSeconds')::int, coalesce(event->>'navigation' = 'reload', false)
  FROM checked
  WHERE NOT EXISTS (
    SELECT FROM site_audience.events ingested WHERE ingested.brand = p_brand
      AND ingested.environment = p_environment AND ingested.id = (checked.event->>'id')::uuid
  )
  ORDER BY ordinality
  LIMIT greatest(0, 1800 - current_session.event_count)
  ON CONFLICT (brand, environment, id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count > 0 THEN
    UPDATE site_audience.sessions
      SET last_activity_at = greatest(last_activity_at, captured_at), event_count = event_count + inserted_count
      WHERE brand = p_brand AND environment = p_environment AND id = p_session_id;
  END IF;
  RETURN 'ok';
END $$;

--> statement-breakpoint
CREATE FUNCTION site_audience.cleanup()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, site_audience AS $$
  DELETE FROM site_audience.events WHERE happened_at < now() - interval '65 days';
  DELETE FROM site_audience.sessions WHERE last_activity_at < now() - interval '65 days';
  DELETE FROM site_audience.rate_windows WHERE slot < now() - interval '30 minutes';
$$;
REVOKE ALL ON FUNCTION site_audience.cleanup() FROM PUBLIC, anon, authenticated, service_role;
DO $$
BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
    PERFORM cron.schedule('site-audience-retention', '13,28,43,58 * * * *', 'SELECT site_audience.cleanup()');
  END IF;
END $$;

CREATE FUNCTION site_audience.totals(b text, e text, start_at timestamptz, stop_at timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, site_audience AS $$
  SELECT jsonb_build_object('visitors', count(DISTINCT s.visitor_id), 'sessions', count(DISTINCT v.session_id),
    'views', count(*))
  FROM site_audience.events v JOIN site_audience.sessions s
    ON (v.brand, v.environment, v.session_id) = (s.brand, s.environment, s.id)
  WHERE v.brand = b AND v.environment = e AND v.kind = 'page_view'
    AND v.happened_at >= start_at AND v.happened_at < stop_at
$$;

CREATE FUNCTION site_audience.rank_pages(
  b text, e text, start_at timestamptz, stop_at timestamptz, min_sample int, row_limit int
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, site_audience AS $$
  WITH counted AS (
    SELECT kind, CASE WHEN kind = 'menu_click' THEN menu ELSE page END AS key, count(*) AS count
      FROM site_audience.events
      WHERE brand = b AND environment = e AND happened_at >= start_at AND happened_at < stop_at
        AND kind IN ('page_view', 'menu_click')
      GROUP BY 1, 2 HAVING count(DISTINCT session_id) >= min_sample
  ), ranked AS (
    SELECT *, row_number() OVER (PARTITION BY kind ORDER BY count DESC, key) AS rank FROM counted
  )
  SELECT jsonb_build_object(
    'pages', coalesce(jsonb_agg(jsonb_build_object('key',key,'count',count) ORDER BY rank)
      FILTER (WHERE kind = 'page_view' AND rank <= row_limit), '[]'::jsonb),
    'menus', coalesce(jsonb_agg(jsonb_build_object('key',key,'count',count) ORDER BY rank)
      FILTER (WHERE kind = 'menu_click' AND rank <= row_limit), '[]'::jsonb)
  ) FROM ranked
$$;

CREATE FUNCTION site_audience.origins(
  b text, e text, start_at timestamptz, stop_at timestamptz, min_sample int
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, site_audience AS $$
  WITH visited AS (
    SELECT session_id, bool_or(kind = 'property_view') AS property,
      bool_or(kind IN ('whatsapp_click', 'form_received')) AS contact
    FROM site_audience.events
    WHERE brand = b AND environment = e AND happened_at >= start_at AND happened_at < stop_at
      AND kind IN ('page_view', 'property_view', 'whatsapp_click', 'form_received')
    GROUP BY session_id HAVING bool_or(kind = 'page_view')
  ), counts AS (
    SELECT s.channel, s.source, s.medium, s.campaign, s.entry_page,
      count(*) AS sessions, count(*) FILTER (WHERE v.property) AS property_sessions,
      count(*) FILTER (WHERE v.contact) AS contact_sessions
    FROM visited v JOIN site_audience.sessions s ON (s.brand,s.environment,s.id) = (b,e,v.session_id)
    GROUP BY 1,2,3,4,5
  ), ranked AS (
    SELECT *, row_number() OVER (
      ORDER BY sessions DESC, channel, source NULLS FIRST,medium NULLS FIRST,campaign NULLS FIRST,entry_page
    ) AS rank FROM counts
  )
  SELECT jsonb_build_object(
    'totalSessions', coalesce(sum(sessions),0),
    'withheldSessions', coalesce(sum(sessions) FILTER (WHERE sessions < min_sample OR rank > 50),0),
    'origins', coalesce(jsonb_agg(jsonb_build_object('channel',channel,'source',source,'medium',medium,
      'campaign',campaign,'entryPage',entry_page,'sessions',sessions,'propertySessions',property_sessions,
      'contactSessions',contact_sessions) ORDER BY rank)
      FILTER (WHERE sessions >= min_sample AND rank <= 50),'[]'::jsonb)
  ) FROM ranked
$$;

CREATE FUNCTION site_audience.ratio(n bigint, sample bigint, min_sample int)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN sample >= min_sample THEN jsonb_build_object('count', n, 'sample', sample) ELSE NULL END
$$;

CREATE FUNCTION site_audience.engagement(
  b text, e text, start_at timestamptz, stop_at timestamptz, expires_at timestamptz,
  report_at timestamptz, min_sample int, rank_limit int
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, site_audience AS $$
  WITH picked AS MATERIALIZED (
    SELECT v.* FROM site_audience.events v WHERE v.brand = b AND v.environment = e
      AND v.happened_at >= start_at AND v.happened_at < stop_at
  ), sessions AS MATERIALIZED (
    SELECT s.id, s.visitor_id, s.last_activity_at, s.measurable_activity,
      count(*) FILTER (WHERE v.kind = 'page_view') AS pages,
      count(DISTINCT property_id) FILTER (WHERE v.kind = 'property_view') AS properties,
      bool_or(v.kind IN ('search','menu_click','property_click','quick_view',
        'whatsapp_click','form_received')) AS interacted,
      bool_or(v.kind = 'form_received') AS form
    FROM picked v JOIN site_audience.sessions s ON (s.brand,s.environment,s.id) = (b,e,v.session_id)
    GROUP BY s.id,s.visitor_id,s.last_activity_at,s.measurable_activity,s.started_at
    HAVING bool_or(v.kind = 'page_view')
  ), durations AS (
    SELECT s.id, least(sum(v.active_seconds), greatest(0,floor(extract(epoch FROM
      least(stop_at,s.last_activity_at) - greatest(start_at,x.started_at)))))::integer AS seconds
    FROM sessions s JOIN picked v ON v.session_id = s.id AND v.kind = 'active_time'
    JOIN site_audience.sessions x ON (x.brand,x.environment,x.id) = (b,e,s.id)
    WHERE s.measurable_activity GROUP BY s.id,s.last_activity_at,x.started_at
  ), property_views AS MATERIALIZED (
    SELECT v.session_id,v.sequence,v.happened_at,v.property_id,v.is_reload,
      row_number() OVER (PARTITION BY v.session_id,v.property_id ORDER BY v.sequence) AS seen_order,
      CASE WHEN v.is_reload THEN false ELSE EXISTS (
        SELECT FROM site_audience.sessions earlier
        JOIN site_audience.events ev ON (ev.brand,ev.environment,ev.session_id) = (b,e,earlier.id)
          AND ev.kind = 'property_view' AND ev.property_id = v.property_id
          AND ev.happened_at >= expires_at AND (ev.happened_at,ev.sequence) < (v.happened_at,v.sequence)
        WHERE earlier.brand = b AND earlier.environment = e AND earlier.visitor_id = s.visitor_id
          AND earlier.id <> v.session_id
      ) END AS returned
    FROM picked v JOIN sessions s ON s.id = v.session_id WHERE v.kind = 'property_view'
  ), steps AS (
    SELECT session_id, min(sequence) AS first_search FROM picked
    WHERE kind = 'search' OR (kind = 'page_view' AND page = 'search') GROUP BY session_id
  ), first_property_after_search AS (
    SELECT DISTINCT ON (v.session_id) v.session_id,v.property_id,v.sequence
    FROM property_views v JOIN steps k ON k.session_id = v.session_id AND v.sequence > k.first_search
    ORDER BY v.session_id,v.sequence
  ), last_whatsapp AS (
    SELECT session_id,property_id,max(sequence) AS sequence FROM picked
    WHERE kind = 'whatsapp_click' AND property_id IS NOT NULL GROUP BY session_id,property_id
  ), session_views AS (
    SELECT v.session_id,
      bool_or(v.seen_order > 1 AND NOT v.is_reload) AS reopened,
      bool_or(v.returned) AS returned,
      bool_or(c.sequence > v.sequence) AS reached_whatsapp,
      bool_or(v.sequence > f.sequence AND v.property_id <> f.property_id) AS found_second
    FROM property_views v LEFT JOIN first_property_after_search f ON f.session_id = v.session_id
    LEFT JOIN last_whatsapp c ON c.session_id = v.session_id AND c.property_id = v.property_id
    GROUP BY v.session_id
  ), behavior AS (
    SELECT count(*) AS sessions,
      count(*) FILTER (WHERE s.properties >= 2) AS multi,
      count(*) FILTER (WHERE s.properties > 0) AS property_sessions,
      count(*) FILTER (WHERE s.form) AS forms,
      count(*) FILTER (WHERE k.session_id IS NOT NULL) AS searched,
      count(*) FILTER (WHERE q.reopened) AS reopened,
      count(*) FILTER (WHERE q.returned) AS returned,
      count(*) FILTER (WHERE q.reached_whatsapp) AS reached_whatsapp,
      count(*) FILTER (WHERE q.found_second) AS second_after_search,
      count(*) FILTER (WHERE d.seconds > 0) AS time_sample,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY d.seconds) FILTER (WHERE d.seconds > 0) AS median_seconds,
      count(*) FILTER (WHERE d.seconds > 0 AND s.last_activity_at < stop_at
        AND s.last_activity_at <= report_at - interval '30 minutes') AS exit_sample,
      count(*) FILTER (WHERE d.seconds > 0 AND d.seconds < 10 AND s.pages = 1 AND NOT s.interacted
        AND s.last_activity_at < stop_at AND s.last_activity_at <= report_at - interval '30 minutes') AS exited_fast
    FROM sessions s LEFT JOIN durations d ON d.id = s.id
    LEFT JOIN session_views q ON q.session_id = s.id LEFT JOIN steps k ON k.session_id = s.id
  ), property_history AS (
    SELECT property_id,
      count(*) FILTER (WHERE seen_order > 1 AND NOT is_reload) AS reopens,
      count(DISTINCT session_id) FILTER (WHERE returned) AS return_sessions
    FROM property_views GROUP BY property_id
  ), property_counts AS (
    SELECT property_id,
      count(*) FILTER (WHERE kind = 'property_view') AS views,
      count(*) FILTER (WHERE kind = 'property_click') AS clicks,
      count(DISTINCT session_id) FILTER (WHERE kind = 'property_view') AS sessions,
      count(*) FILTER (WHERE kind = 'quick_view') AS previews,
      count(*) FILTER (WHERE kind = 'whatsapp_click') AS whatsapp,
      count(*) FILTER (WHERE kind = 'form_received') AS forms
    FROM picked WHERE property_id IS NOT NULL
    GROUP BY property_id HAVING count(DISTINCT session_id) FILTER (WHERE kind IN ('property_view','property_click')) >= min_sample
  ), ranked AS (
    SELECT p.*, coalesce(h.reopens,0) AS reopens,coalesce(h.return_sessions,0) AS return_sessions,
      row_number() OVER (ORDER BY views DESC,clicks DESC,p.property_id) AS view_rank,
      row_number() OVER (ORDER BY clicks DESC,views DESC,p.property_id) AS click_rank
    FROM property_counts p LEFT JOIN property_history h USING(property_id)
  ), property_json AS (
    SELECT view_rank,click_rank,views,clicks,
      jsonb_build_object('publicId', property_id, 'listing', NULL, 'views', views, 'clicks', clicks,
        'sessions', sessions, 'reopens', reopens, 'returnSessions', return_sessions,
        'whatsapp', whatsapp, 'forms', forms, 'previews', previews) AS item
    FROM ranked
  )
  SELECT jsonb_build_object(
    'properties', (
      SELECT jsonb_build_object(
        'views', coalesce(jsonb_agg(item ORDER BY view_rank) FILTER (WHERE views > 0 AND view_rank <= rank_limit),'[]'::jsonb),
        'clicks', coalesce(jsonb_agg(item ORDER BY click_rank) FILTER (WHERE clicks > 0 AND click_rank <= rank_limit),'[]'::jsonb)
      ) FROM property_json
    ),
    'behavior', jsonb_build_object(
      'quickExits',site_audience.ratio(exited_fast,exit_sample,min_sample),
      'activeTime',CASE WHEN time_sample >= min_sample
        THEN jsonb_build_object('medianSeconds',median_seconds,'sample',time_sample,'total',sessions) END,
      'multipleProperties',site_audience.ratio(multi,sessions,min_sample),
      'sameSessionReopen',site_audience.ratio(reopened,property_sessions,min_sample),
      'laterSessionReturn',site_audience.ratio(returned,property_sessions,min_sample),
      'searchToSecondProperty',site_audience.ratio(second_after_search,searched,min_sample),
      'propertyToWhatsapp',site_audience.ratio(reached_whatsapp,property_sessions,min_sample),
      'forms',site_audience.ratio(forms,sessions,min_sample)
    )
  ) FROM behavior
$$;

--> statement-breakpoint
CREATE FUNCTION public.site_audience_report(
  p_brand text, p_environment text, p_period text, p_offset int, p_view text, p_policy_version text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, site_audience AS $$
DECLARE tz constant text := 'America/Sao_Paulo';
DECLARE as_of timestamptz := statement_timestamp();
DECLARE retained_since timestamptz := as_of - interval '65 days';
DECLARE local_now timestamp := as_of AT TIME ZONE tz;
DECLARE step interval;
DECLARE local_begin timestamp;
DECLARE local_end timestamp;
DECLARE starts timestamptz;
DECLARE ends timestamptz;
DECLARE observed_until timestamptz;
DECLARE previous_starts timestamptz;
DECLARE previous_ends timestamptz;
DECLARE today_starts timestamptz := date_trunc('day',local_now) AT TIME ZONE tz;
DECLARE week_starts timestamptz := date_trunc('week',local_now) AT TIME ZONE tz;
DECLARE intervals tstzmultirange;
DECLARE requested tstzrange;
DECLARE recorded_since timestamptz;
DECLARE latest_event timestamptz;
DECLARE is_enabled boolean;
DECLARE is_partial boolean;
DECLARE min_sample int;
DECLARE result jsonb;
DECLARE data jsonb;
DECLARE trend jsonb;
DECLARE previous jsonb;
BEGIN
  IF p_brand IS NULL OR p_brand NOT IN ('cordial','morar')
    OR p_environment IS NULL OR p_environment NOT IN ('production','qa')
    OR p_period IS NULL OR p_period NOT IN ('day','week','month')
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 90
    OR p_view IS NULL OR p_view NOT IN ('overview','origins','pages')
  THEN RAISE EXCEPTION 'Invalid audience report' USING ERRCODE = '22023'; END IF;

  step := CASE p_period WHEN 'day' THEN interval '1 day' WHEN 'week' THEN interval '1 week'
    ELSE interval '1 month' END;
  local_begin := date_trunc(p_period,local_now) - step * p_offset;
  local_end := local_begin + step;
  starts := local_begin AT TIME ZONE tz;
  ends := local_end AT TIME ZONE tz;
  observed_until := least(ends, as_of);
  previous_starts := (local_begin - step) AT TIME ZONE tz;
  previous_ends := CASE WHEN p_offset = 0 THEN
    ((local_begin - step) + (local_now - local_begin)) AT TIME ZONE tz ELSE starts END;
  requested := tstzrange(starts,observed_until,'[)');
  SELECT min(c.started_at),
    coalesce(bool_or(c.policy_version = p_policy_version AND c.ended_at IS NULL),false),
    coalesce(range_agg(tstzrange(greatest(c.started_at,retained_since),least(coalesce(c.ended_at,as_of),as_of),'[)'))
      FILTER (WHERE c.started_at < as_of AND coalesce(c.ended_at,as_of) > retained_since), '{}'::tstzmultirange)
    INTO recorded_since,is_enabled,intervals
    FROM site_audience.coverage c WHERE c.brand = p_brand AND c.environment = p_environment;
  SELECT max(v.happened_at) INTO latest_event FROM site_audience.events v
    WHERE v.brand = p_brand AND v.environment = p_environment AND v.happened_at >= retained_since;

  is_partial := NOT intervals @> requested;
  result := jsonb_build_object('brand',p_brand,'environment',p_environment,'period',p_period,
    'offset',p_offset,'from',starts,'to',ends,'asOf',as_of,'lastEventAt',latest_event,
    'collectionSince',recorded_since,'collectionEnabled',is_enabled,'partial',is_partial);
  IF NOT intervals && requested THEN
    RETURN result || jsonb_build_object('status',CASE WHEN is_enabled THEN 'unavailable' ELSE 'disabled' END);
  END IF;

  min_sample := CASE p_environment WHEN 'qa' THEN 1 ELSE 5 END;
  IF p_view = 'origins' THEN
    data := site_audience.origins(p_brand,p_environment,greatest(starts,retained_since),observed_until,min_sample);
  ELSIF p_view = 'pages' THEN
    data := site_audience.rank_pages(p_brand,p_environment,greatest(starts,retained_since),observed_until,min_sample,30);
  ELSE
    IF NOT is_partial AND previous_ends <= starts
       AND intervals @> tstzrange(previous_starts,previous_ends,'[)')
    THEN previous := site_audience.totals(p_brand,p_environment,previous_starts,previous_ends);
    END IF;
    WITH generated AS (
      SELECT bucket AT TIME ZONE tz AS bucket,
        (bucket + CASE p_period WHEN 'day' THEN interval '1 hour' ELSE interval '1 day' END) AT TIME ZONE tz AS following
        FROM generate_series(local_begin,local_end,
          CASE p_period WHEN 'day' THEN interval '1 hour' ELSE interval '1 day' END) bucket
        WHERE bucket < local_end AND bucket < local_now
    ), values_by_bucket AS (
      SELECT date_trunc(CASE p_period WHEN 'day' THEN 'hour' ELSE 'day' END,happened_at AT TIME ZONE tz) AT TIME ZONE tz AS bucket,
        count(*) AS views FROM site_audience.events
      WHERE brand = p_brand AND environment = p_environment AND kind = 'page_view'
        AND happened_at >= greatest(starts,retained_since) AND happened_at < observed_until
      GROUP BY 1
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('start',g.bucket,'views',
      CASE WHEN intervals && tstzrange(g.bucket,least(g.following,observed_until),'[)')
        THEN coalesce(v.views,0) END) ORDER BY g.bucket),'[]'::jsonb)
      INTO trend FROM generated g LEFT JOIN values_by_bucket v USING (bucket)
      WHERE g.following > g.bucket;

    data := jsonb_build_object('overview',
      jsonb_build_object('totals',site_audience.totals(p_brand,p_environment,greatest(starts,retained_since),observed_until),
        'previous',previous,'trend',trend,
        'today',CASE WHEN intervals && tstzrange(today_starts,as_of,'[)') THEN
          site_audience.totals(p_brand,p_environment,today_starts,as_of) END,
        'week',CASE WHEN intervals && tstzrange(week_starts,as_of,'[)') THEN
          site_audience.totals(p_brand,p_environment,week_starts,as_of) END)
      || site_audience.rank_pages(p_brand,p_environment,greatest(starts,retained_since),observed_until,min_sample,5)
      || site_audience.engagement(p_brand,p_environment,greatest(starts,retained_since),observed_until,retained_since,as_of,min_sample,
        CASE p_period WHEN 'month' THEN 10 ELSE 5 END));
  END IF;

  RETURN result || jsonb_build_object('status','ready','view',p_view) || data;
END $$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA site_audience FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.site_audience_configure(text,text,text,boolean),
  public.site_audience_collection_status(text,text,text),
  public.site_audience_ingest(text,text,text,text,uuid,uuid,jsonb,text,text,text,text),
  public.site_audience_report(text,text,text,int,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_audience_configure(text,text,text,boolean),
  public.site_audience_collection_status(text,text,text),
  public.site_audience_ingest(text,text,text,text,uuid,uuid,jsonb,text,text,text,text),
  public.site_audience_report(text,text,text,int,text,text) TO service_role;
