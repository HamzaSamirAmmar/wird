-- Fix: pg_net's http_post body parameter is jsonb (no text overload exists), so the
-- dispatcher's `body := ...::text` failed to resolve a matching function.

create or replace function public.dispatch_due_campaigns()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_key text;
  r record;
begin
  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'wird_dispatch_key';

  if v_key is null then
    return; -- one-time setup not done yet; see AGENTS.md
  end if;

  for r in
    select id from public.notification_campaigns
    where is_active and next_run_at is not null and next_run_at <= now()
  loop
    perform net.http_post(
      url := 'https://rpvzxseygmsbvumkciil.supabase.co/functions/v1/push-notifications',
      body := jsonb_build_object('campaignId', r.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      )
    );
  end loop;
end;
$$;
