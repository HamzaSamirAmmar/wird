-- notify_new_duties() fired immediately for any duty assigned for today, at any hour. That
-- double-pings employees assigned a duty between 00:00 and 08:00 Damascus: once now, once
-- again a few hours later from the seeded 08:00 'incomplete_today' campaign.
--
-- Skip the immediate ping only in that 04:00–08:00 window (the daily campaign is about to
-- cover it); fire immediately the rest of the day and overnight, same as before.
create or replace function public.notify_new_duties()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  v_ids uuid[];
  v_local_time time := (now() at time zone 'Asia/Damascus')::time;
begin
  if v_local_time >= '04:00' and v_local_time < '08:00' then
    return null;
  end if;

  select array_agg(distinct nd.employee_id) into v_ids
  from new_duties nd
  where nd.due_date = (now() at time zone 'Asia/Damascus')::date;

  if v_ids is null or cardinality(v_ids) = 0 then
    return null;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'wird_dispatch_key';

  if v_key is null then
    return null;
  end if;

  perform net.http_post(
    url := 'https://rpvzxseygmsbvumkciil.supabase.co/functions/v1/push-notifications',
    body := jsonb_build_object(
      'auto', jsonb_build_object('kind', 'new_duty', 'profileIds', to_jsonb(v_ids))
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    )
  );

  return null;
end;
$$;
