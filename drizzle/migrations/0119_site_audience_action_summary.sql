-- Extend the controlled vocabulary. No contact destination, free text or advertising ID is stored.
ALTER TABLE site_audience.events DROP CONSTRAINT events_kind_check,
  ADD CONSTRAINT events_kind_check CHECK (kind IN (
    'session_start', 'page_view', 'menu_click', 'property_click', 'property_view', 'quick_view',
    'active_time', 'search', 'whatsapp_click', 'form_received', 'gallery_open',
    'favorite_change', 'selection_change', 'phone_click', 'email_click'
  )) NOT VALID;
--> statement-breakpoint
ALTER TABLE site_audience.events VALIDATE CONSTRAINT events_kind_check;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION site_audience.rank_pages(
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
  ) || CASE WHEN row_limit > 5 THEN jsonb_build_object('actions', (
    SELECT coalesce(jsonb_agg(jsonb_build_object('key', kind, 'count', n) ORDER BY n DESC, kind), '[]'::jsonb)
    FROM (
      SELECT kind, count(*) AS n FROM site_audience.events
      WHERE brand = b AND environment = e AND happened_at >= start_at AND happened_at < stop_at
        AND kind NOT IN ('session_start','page_view','property_view','active_time')
      GROUP BY kind
    ) totals
  )) ELSE '{}'::jsonb END FROM ranked
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION site_audience.engagement(
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
      bool_or(v.kind NOT IN ('session_start','page_view','property_view','active_time')) AS interacted,
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
CREATE OR REPLACE FUNCTION site_audience.origins(
  b text, e text, start_at timestamptz, stop_at timestamptz, min_sample int
) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, site_audience AS $$
  WITH visited AS (
    SELECT session_id, bool_or(kind = 'property_view') AS property,
      bool_or(kind IN ('whatsapp_click', 'form_received', 'phone_click', 'email_click')) AS contact
    FROM site_audience.events
    WHERE brand = b AND environment = e AND happened_at >= start_at AND happened_at < stop_at
      AND kind IN ('page_view', 'property_view', 'whatsapp_click', 'form_received', 'phone_click', 'email_click')
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
