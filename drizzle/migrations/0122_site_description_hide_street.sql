-- Public site prose: remove the hidden street (and the number right after it) instead of blanking the whole text.
-- properties.descricao_imovel / pontos_fortes are never changed; only the public views read the sanitized text.
CREATE OR REPLACE FUNCTION public.site_strip_street_from_text(_street text, _text text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $fn$
DECLARE
  core text;
  pat text := '';
  ch text;
  i int;
  r text;
BEGIN
  IF _text IS NULL THEN RETURN ''; END IF;
  core := lower(translate(btrim(coalesce(_street, '')),
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'));
  core := regexp_replace(core, '^(rua|r\.|avenida|av\.?|travessa|tv\.?|alameda|al\.|rodovia|rod\.|estrada|servidao)\s+', '');
  core := btrim(regexp_replace(core, '\s+', ' ', 'g'));
  IF core IN ('', '0') THEN RETURN _text; END IF;
  FOR i IN 1..length(core) LOOP
    ch := substr(core, i, 1);
    pat := pat || CASE
      WHEN ch = ' ' THEN '(?:\s|&nbsp;|<[^>]*>)*'
      WHEN ch = 'a' THEN '[aáàâãäå]'
      WHEN ch = 'e' THEN '[eéèêë]'
      WHEN ch = 'i' THEN '[iíìîï]'
      WHEN ch = 'o' THEN '[oóòôõö]'
      WHEN ch = 'u' THEN '[uúùûü]'
      WHEN ch = 'c' THEN '[cç]'
      WHEN ch = 'n' THEN '[nñ]'
      WHEN ch ~ '[a-z0-9]' THEN ch
      ELSE '.?'
    END;
  END LOOP;
  pat := '(?:(?:rua|r\.|avenida|av\.?|travessa|tv\.?|alameda|al\.|rodovia|rod\.|estrada|servid[aã]o)(?:\s|&nbsp;|<[^>]*>)*)?' || pat;
  r := regexp_replace(_text, pat, chr(1), 'gi');
  r := regexp_replace(r, '<(\w+)[^>]*>[\s' || chr(1) || ']*</\1>', chr(1), 'gi');
  r := regexp_replace(r, chr(1) || '\s*[,\-–]?\s*(?:(?:n[úu]mero|n[º°o]\.?|n\.)\s*)?(?:\d+[a-z]?\M|s/?n\M)', chr(1), 'gi');
  r := replace(r, chr(1), ' ');
  -- tidy what the removal leaves behind
  r := regexp_replace(r, '<(\w+)[^>]*>\s*</\1>', ' ', 'gi');
  FOR i IN 1..3 LOOP
    r := regexp_replace(r, '\m(na|no|da|do|em|à|a|pela|pelo|para|frente|rua|avenida|esquina|com)\s*(?=[,.;:!?)]|$)', '', 'gi');
  END LOOP;
  r := regexp_replace(r, '\(\s*\)', '', 'g');
  r := regexp_replace(r, '[ \t]+([,.;:!?])', '\1', 'g');
  r := regexp_replace(r, '([,;:])\s*([,.;:!?])', '\2', 'g');
  r := regexp_replace(r, '([.!?])[ \t]*[,;:.]+', '\1', 'g');
  r := regexp_replace(r, '(^|\n)[ \t,.;:\-–]+', '\1', 'g');
  r := regexp_replace(r, '[ \t]{2,}', ' ', 'g');
  r := regexp_replace(r, '\n{3,}', E'\n\n', 'g');
  r := btrim(r, E' \t\n\r,;:-');
  IF length(regexp_replace(lower(regexp_replace(r, '<[^>]*>', '', 'g')), '[^a-z0-9áàâãäéèêëíìîïóòôõöúùûüçñ]', '', 'g')) < 3 THEN
    RETURN '';
  END IF;
  RETURN r;
END
$fn$;

REVOKE ALL ON FUNCTION public.site_strip_street_from_text(text, text) FROM PUBLIC;
DO $do$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.site_strip_street_from_text(text, text) FROM %I', r);
    END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['service_role', 'public_bot_owner'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.site_strip_street_from_text(text, text) TO %I', r);
    END IF;
  END LOOP;
END
$do$;

-- Brand wrappers: strip only when the brand's existing rule says the address is hidden; if anything is
-- still detected afterwards, fall back to '' exactly like before (never leak).
DO $do$
DECLARE
  brand text;
  r text;
  def text;
  changed text;
BEGIN
  FOREACH brand IN ARRAY ARRAY['cordial', 'morar'] LOOP
    IF to_regprocedure(format('public.%s_site_has_hidden_address(public.properties,text)', brand)) IS NULL
       OR to_regclass(format('public.%s_site_eligible', brand)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION public.%1$s_site_strip_hidden_address(p public.properties, _text text)
      RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $b$
        SELECT CASE
          WHEN NOT public.%1$s_site_has_hidden_address(p, _text) THEN _text
          ELSE (SELECT CASE WHEN s = '' OR public.%1$s_site_has_hidden_address(p, s) THEN '' ELSE s END
                FROM public.site_strip_street_from_text(p.logradouro, _text) s)
        END
      $b$$f$, brand);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s_site_strip_hidden_address(public.properties, text) FROM PUBLIC', brand);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s_site_strip_hidden_address(public.properties, text) FROM %I', brand, r);
      END IF;
    END LOOP;
    FOREACH r IN ARRAY ARRAY['service_role', 'public_bot_owner'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s_site_strip_hidden_address(public.properties, text) TO %I', brand, r);
      END IF;
    END LOOP;

    -- Recreate the eligible view from its current definition, swapping only the two prose columns.
    def := pg_get_viewdef(format('public.%s_site_eligible', brand)::regclass, false);
    changed := regexp_replace(def,
      'CASE\s+WHEN\s+(?:public\.)?' || brand || '_site_has_hidden_address\(p\.\*,\s*p\.descricao_imovel\)\s+THEN\s+''''::text\s+ELSE\s+p\.descricao_imovel\s+END\s+AS\s+descricao_imovel',
      'public.' || brand || '_site_strip_hidden_address(p.*, p.descricao_imovel) AS descricao_imovel');
    IF changed = def THEN RAISE EXCEPTION '%_site_eligible: descricao_imovel expression not found', brand; END IF;
    def := changed;
    changed := regexp_replace(def,
      'CASE\s+WHEN\s+(?:public\.)?' || brand || '_site_has_hidden_address\(p\.\*,\s*p\.pontos_fortes\)\s+THEN\s+NULL::text\s+ELSE\s+p\.pontos_fortes\s+END\s+AS\s+pontos_fortes',
      'NULLIF(public.' || brand || '_site_strip_hidden_address(p.*, p.pontos_fortes), '''') AS pontos_fortes');
    IF changed = def THEN RAISE EXCEPTION '%_site_eligible: pontos_fortes expression not found', brand; END IF;
    EXECUTE format('CREATE OR REPLACE VIEW public.%s_site_eligible WITH (security_invoker=true) AS %s', brand, rtrim(changed, '; '));
  END LOOP;
END
$do$;
