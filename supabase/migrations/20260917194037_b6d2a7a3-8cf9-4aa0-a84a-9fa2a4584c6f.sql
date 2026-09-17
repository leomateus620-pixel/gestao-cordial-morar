create or replace function public.property_image_batch_bump(_batch_id uuid, _column text)
returns public.property_image_batches
language plpgsql
security definer
set search_path = public
as $$
declare
  _row public.property_image_batches;
begin
  if _column not in ('registered_count','duplicated_count','failed_count') then
    raise exception 'coluna invalida';
  end if;

  update public.property_image_batches
     set registered_count  = registered_count  + case when _column = 'registered_count' then 1 else 0 end,
         duplicated_count  = duplicated_count  + case when _column = 'duplicated_count' then 1 else 0 end,
         failed_count      = failed_count      + case when _column = 'failed_count' then 1 else 0 end
   where id = _batch_id
  returning * into _row;

  if _row.id is null then
    return null;
  end if;

  update public.property_image_batches
     set status = case
                    when (_row.registered_count + _row.duplicated_count + _row.failed_count) < coalesce(_row.expected_count,0) then 'open'
                    when _row.failed_count > 0 then 'incomplete'
                    else 'complete'
                  end
   where id = _batch_id
  returning * into _row;

  return _row;
end;
$$;

revoke all on function public.property_image_batch_bump(uuid, text) from public, anon;
grant execute on function public.property_image_batch_bump(uuid, text) to authenticated, service_role;