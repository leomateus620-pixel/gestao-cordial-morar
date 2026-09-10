with l as (
  select p.id, t.line, t.ord,
    (t.line ~* '(comiss[aã]o|averb|propriet[áa]|agenciad[oa]|corretor|exclusividade|contrato de compra e venda|pra ele|chaves? (na|com|no)\M)'
     or t.line ~* '^\s*ag\s*(\.\s*|:\s*|\s+)[[:alpha:]]') as interna
  from public.properties p,
       lateral unnest(regexp_split_to_array(p.pontos_fortes, E'\r?\n')) with ordinality as t(line, ord)
  where p.archived_at is null and coalesce(p.pontos_fortes, '') <> ''
), agg as (
  select id,
    nullif(btrim(string_agg(line, E'\n' order by ord) filter (where not interna)), '') as publico,
    nullif(btrim(string_agg(line, E'\n' order by ord) filter (where interna)), '') as interno
  from l group by id
  having bool_or(interna)
)
update public.properties p
set pontos_fortes = a.publico,
    observacao_imovel = nullif(btrim(concat_ws(E'\n', nullif(btrim(coalesce(p.observacao_imovel, '')), ''), a.interno)), ''),
    updated_at = now()
from agg a
where p.id = a.id;