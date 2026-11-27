-- Brand-wide activity remains visible before an individual ranking reaches its sample threshold.
CREATE OR REPLACE FUNCTION site_audience.totals(b text, e text, start_at timestamptz, stop_at timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = pg_catalog, site_audience AS $$
  SELECT jsonb_build_object(
    'visitors', count(DISTINCT s.visitor_id) FILTER (WHERE v.kind = 'page_view'),
    'sessions', count(DISTINCT v.session_id) FILTER (WHERE v.kind = 'page_view'),
    'views', count(*) FILTER (WHERE v.kind = 'page_view'),
    'propertyViews', count(*) FILTER (WHERE v.kind = 'property_view'),
    'propertyClicks', count(*) FILTER (WHERE v.kind = 'property_click'),
    'menuClicks', count(*) FILTER (WHERE v.kind = 'menu_click')
  )
  FROM site_audience.events v JOIN site_audience.sessions s
    ON (v.brand, v.environment, v.session_id) = (s.brand, s.environment, s.id)
  WHERE v.brand = b AND v.environment = e
    AND v.kind IN ('page_view', 'property_view', 'property_click', 'menu_click')
    AND v.happened_at >= start_at AND v.happened_at < stop_at
$$;
