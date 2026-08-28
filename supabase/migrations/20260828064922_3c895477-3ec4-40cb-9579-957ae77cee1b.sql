CREATE OR REPLACE FUNCTION public.region_display_label(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(btrim(coalesce(_raw, '')), '\s+', ' ', 'g'),
        '^[Bb]airro\s+', ''
      ),
      '\s+-\s+Loteamento\s+', ' · Loteamento ', 'g'
    ),
  '')
$$;

CREATE OR REPLACE FUNCTION public.region_normalized_key(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NULLIF(
    regexp_replace(
      lower(
        translate(
          public.region_display_label(_raw),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'
        )
      ),
      '[^a-z0-9]+', ' ', 'g'
    ),
  '')
$$;