# AGENTS.md

**Wird (ورد)** — daily Quran memorization duty tracker for a workplace: supervisors assign per-day memorization/review ranges to groups; employees track checklist progress in an offline-capable Arabic PWA. Backend is Supabase (Postgres with triggers/RLS + edge functions). pnpm + Turborepo monorepo.

Three roles: **superadmin** (global, seed-only bootstrap, creates supervisors and employees), **supervisor** (created by a superadmin, scoped to exactly one group — everything in this doc about "supervisors" managing groups/employees/duties applies only within their own group), **employee**. Banners remain superadmin-only. Push campaigns: a superadmin sends to anyone/any group; a supervisor sends only to their own group (`notification_campaigns.group_id`).

## Commands

```bash
pnpm install                # node >= 20, pnpm 10.x (corepack)

# Repo-wide (via turbo, run in all packages that define them)
pnpm build                  # apps: tsc -b && vite build; packages have no build step
pnpm dev                    # dashboard on :5173, pwa on :5174
pnpm lint                   # oxlint (apps only)
pnpm typecheck              # tsc --noEmit everywhere
pnpm format / format:check  # prettier on the whole repo (singleQuote, printWidth 100)

# Single workspace
pnpm --filter @wird/pwa dev

# Generators (manual, rarely needed)
node packages/quran-data/scripts/generate-quran-data.mjs   # regenerates pageStarts.ts from tanzil.net
node --experimental-strip-types packages/quran-data/scripts/generate-mushaf-lines.mjs   # Madinah 15-line layout → apps/pwa/public/mushaf/lines.json + public/fonts/UthmanicHafs.woff2 (api.quran.com)
node icon-src/generate-icons.mjs                            # from inside apps/dashboard or apps/pwa; renders @wird/brand mark to public/*.png via sharp

# First-superadmin bootstrap (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_SUPERADMIN_USERNAME/PASSWORD/NAME)
pnpm db:seed-superadmin
```

**There are no tests.** The verification loop is `pnpm typecheck && pnpm lint && pnpm build`.

Env: each app needs `apps/<app>/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). The client throws at import time if missing.

## Layout

- `apps/dashboard` (@wird/dashboard) — supervisor web app: groups, users, day-by-day duty assignment, follow-up.
- `apps/pwa` (@wird/pwa) — employee app: duty checklist, mushaf reader, leaderboard. Installable PWA with offline support. Responsive: a phone-width single column (the canonical design) that becomes a two-pane layout at `lg` — duties in the main column, reminder banner + sticky standings sidebar beside it — then two duty cards per row at `xl` and a wider canvas at `2xl`; the muṣḥaf reader shows a two-page spread from `xl`, and auth screens split into brand panel + form at `lg`. Keep the phone layout untouched when editing; verify the wide variants too.
- `packages/domain` — shared types, zod schemas, duty category definitions, username→email logic. No framework deps.
- `packages/quran-data` — surah metadata + 604-page mushaf page index.
- `packages/supabase-client` — typed client factory (`createWirdClient`), username sign-in, `database.types.ts`.
- `packages/ui-web` — shared React presentational components.
- `packages/design-tokens` — colors/typography/spacing + `theme.css`.
- `packages/brand` — brand mark geometry (mjs) shared by both apps' icon generation.
- `supabase/` — SQL migrations, Deno edge functions (`functions/`), superadmin seed script.

Workspace packages expose **raw TS source** (`main: src/index.ts`), no build/dist. Changes are picked up instantly by the Vite apps; `import` uses `@wird/*` names.

Stack per app: React 19, react-router-dom v7 (declarative `<Routes>`; no data loaders), Tailwind CSS v4 (via `@tailwindcss/vite`, no tailwind config file), react-hook-form + zod (dashboard), oxlint (not eslint).

## Backend architecture — where the business logic lives

Most write-path logic is in **Postgres triggers**, not app code (`supabase/migrations/20260827074248_initial_schema.sql` and later migrations). Do not try to replicate these in TS:

- **Group move**: changing an employee's `group_id` deletes **all** their duties (history included) and backfills the new group's assignments from today (Damascus) on (`backfill_group_duties`).
- **Fan-out**: inserting a `duty_group_assignments` row auto-creates one `duties` row per _active employee_ in the group (`fanout_group_assignment`). Apps only ever write to `duty_group_assignments`.
- **Propagate**: updating a group assignment propagates scope/date/category to its **still-`pending`** duties only, and reseeds their checklists (`propagate_group_assignment_update`). Duties already `in_progress`/`completed` are intentionally left alone.
- **Deleting** a group assignment cascades to its duties (FK is `on delete cascade` — deliberately changed from SET NULL by a migration; don't revert).
- **Checklist**: a new duty's `duty_step_progress` rows are seeded from `duty_category_steps` (`seed_duty_steps`).
- **Status is derived**: `duties.status` is computed from checklist counts by `sync_duty_status`. Employees tick `duty_step_progress.is_completed`; nobody writes `status` directly.
- **Ticks are final**: an employee can never untick a step. The PWA only offers ticking (`completeStep`), and `keep_step_completed` (BEFORE UPDATE) turns an employee's untick into a no-op that still matches the row — not an error, so an old client's queued untick drains from the outbox instead of retrying forever. Supervisors/superadmins/server code are unrestricted. `stamp_step_completed_at` stamps `completed_at` server-side on every completed step (old installed PWAs don't send it), so leaderboard timing tiebreaks never depend on client clocks or `duties.updated_at`.

RLS is on every table (`is_supervisor()` / `is_superadmin()` / `caller_group_id()` helpers, `20260927000001_scope_supervisor_to_group.sql`). Employees see only their own group/duties; a supervisor is scoped the same way to their one group (via `caller_group_id()`); a superadmin sees everything. Aggregates that need cross-employee reads (leaderboard, follow-up, streaks) are `security definer` RPCs in `20260830120000_leaderboard.sql` (`group_leaderboard`, `duty_followup`, `employee_current_streak`) that return only counts + names — the pattern for any new cross-user read model. The PWA leaderboard (`20261004000000_leaderboard_day_based.sql`) is **day-based, all-or-nothing**: a day counts as completed only when every duty (all categories) due that day is completed; it ranks by had-duties, exact day rate, completed-day volume, earlier wrap-up (step ticks only), then streak. `duty_followup` remains per-duty so supervisors see exactly which duties are done and which are not. `duty_followup` force-overrides its `p_group_id` argument to the caller's own group when the caller is a plain supervisor (not superadmin), so a supervisor can't pass another group's id. No service-role keys in the apps.

`packages/supabase-client/src/database.types.ts` must be kept in sync with migrations (regenerate with `supabase gen types` after schema changes) — it's committed, not generated at build time.

### Sync gotchas that have caused real bugs

- `duty_group_assignments` has a unique `(group_id, category, due_date)` constraint: the dashboard edits a group's whole day at once, so one row per category per day is a hard invariant.
- `propagate_group_assignment_update` deletes and re-inserts `duty_step_progress` rows with **new ids**. The PWA cache refresh therefore deletes stale cached steps before `bulkPut` (see `apps/pwa/src/lib/duties.ts`) — a plain upsert renders the checklist twice.
- The PWA shows **today and `HISTORY_DAYS` (30) back, never the future** — employees must not work ahead of the supervisor's plan. `HISTORY_DAYS` in `apps/pwa/src/lib/dates.ts` is the single source of truth: the day rail draws exactly that range and `lib/duties.ts` syncs exactly that window. Syncing narrower than the UI displays makes real duties render as "no duties"; syncing wider caches upcoming duties the employee is not allowed to see. The **dashboard** keeps its own `isoWeekStart`/week strip and still sees future days — supervisors assign them.

## Cross-cutting conventions

- **Arabic-first, RTL.** All user-facing strings are inline Arabic literals (e.g. `'اسم المستخدم أو كلمة المرور غير صحيحة'`); `<html lang="ar" dir="rtl">`. There is no i18n framework — don't introduce one or translate strings to English.
- **Usernames, not emails.** Supabase Auth requires an email; usernames map deterministically to `<username>@wird.local` (`packages/domain/src/username.ts`, pattern `^[a-z0-9_.]{3,32}$`). Never surface emails in UI or send mail.
- **`must_change_password`**: employees created by the supervisor get a generated password; `true` forces a redirect to the change-password screen after login.
- **Case mapping is manual**: DB columns are snake_case, domain types (`packages/domain/src/types.ts`) are camelCase. Each app converts at the fetch boundary (`toProfile()` in auth-context, mappings in `lib/duties.ts`). New columns need both sides updated.
- **Banners are free text.** They used to carry a `kind` enum (آية / حديث / حكمة / ملاحظة); that column and `public.banner_kind` were dropped — a banner is now just `body` + optional `source`. Don't reintroduce a taxonomy without being asked.
- **Duty categories are fixed** (`new_memorization`, `minor_review`, `major_review`) and their step definitions are **duplicated** in `packages/domain/src/dutyCategories.ts` and the `duty_category_steps` seed in SQL — keep them in sync.
- **Dates are local calendar days** (`YYYY-MM-DD`), never instants. Use the helpers in each app's `src/lib/dates.ts` (`todayISO`, `addDays`); `Date.toISOString()` resolves to the UTC day and is off-by-one east of Greenwich. Weeks start **Saturday**.
- **Offline is cache-first, not network-first.** Dexie (`lib/offline.ts`, schema v2) holds duties, steps, an outbox, **banners**, and a `meta` store (`lastSyncedAt`, the cached profile, device id, mirrored access token, cached leaderboards, shown push ids). The UI renders the cache and the network only refreshes it; a failed refresh leaves the cache standing rather than blanking the screen. `lastSyncedAt` is stamped **only on a completed sync**, so the age the header reports is the truth. `lib/offline.ts` must stay free of DOM-only APIs — the service worker imports it.
  - **Offline session**: with an expired access token and no network, supabase-js reports _no session_. `auth-context` treats that (`isAuthRetryableFetchError`) as "signed in offline" on the cached profile — `signedIn`, not `session`, is what guards routes. Only a real auth rejection signs out.
  - **Outbox**: one entry per step (latest wins), carrying `dutyId` + `stepKey`. `flushOutboxWith()` treats **zero updated rows as not-success** (an expired session under RLS returns no error and matches nothing — that used to silently drop ticks); it retries by `(duty_id, step_key)` for re-seeded steps. After every server write into the cache, `overlayPendingOutbox()` re-applies queued ticks so they never visibly un-tick.
  - **Sync**: `syncNow()` is single-flight; `MyDuties` debounces triggers (mount, `online`, foreground, realtime, SW messages) and retries every 30 s while ticks are pending. Chromium also gets Background Sync (`OUTBOX_SYNC_TAG`): the SW flushes with the **mirrored** access token only while it is unexpired — it never refreshes (two refreshers racing on one refresh token sign the user out).
  - **Lie-fi**: every Supabase request goes through `fetchWithTimeout` (`lib/connectivity.ts`, 12 s). The offline badge follows real request results (`useOnline`), but sync attempts are gated only on `navigator.onLine` — gating them on the reachability flag would deadlock, since only a request can prove we're back.
  - Fonts are self-hosted (`@fontsource/*`, imported in `main.tsx`) so they're precached — Google Fonts left the muṣḥaf without Amiri offline.
- **Service worker** is our own, `apps/pwa/src/sw.ts` (vite-plugin-pwa `injectManifest`, compiled by `tsconfig.sw.json` against the WebWorker lib — `tsconfig.app.json` excludes it). It precaches the build, handles push and Background Sync. **Muṣḥaf assets**: `apps/pwa/public/mushaf/lines.json` (~1.5 MB, every word of the 604-page Madinah muṣḥaf on its printed line, KFGQPC Hafs text) and `public/fonts/UthmanicHafs.woff2` are precached (`maximumFileSizeToCacheInBytes` was raised for them); omitting either makes the reader and the PDF online-only. Data offline-ability is handled via Dexie/IndexedDB, deliberately NOT via SW runtime caching of Supabase API responses.
- **Edge functions are Deno** (`supabase/functions/*`), deployed from their own directory only — CORS headers are inlined on purpose (see comment in `create-employee/index.ts`); `_shared/cors.ts` exists but is not imported. `push-notifications` imports its sibling `wird-templates.ts`, which the deploy bundles. `create-employee` re-implements username validation because it can't import workspace packages.
- Account creation can't be done from the apps (creating an auth user needs the service role). It goes through the `create-employee` edge function (verifies the caller is a supervisor or superadmin via their own JWT, then writes with the service-role client). A supervisor caller may only create `role: 'employee'` within their own `group_id`; a superadmin may create either role in any group. The **first** superadmin is bootstrapped by `supabase/seed/seed-superadmin.ts` to break that chicken-and-egg — `superadmin` accounts are never created through the app itself.
- Supabase local dev: `supabase/config.toml` lists `./seed.sql` as the seed file but it doesn't exist — `supabase db reset` will not find a seed; superadmin bootstrap is done via the script above instead.
- **Muṣḥaf pages**: `apps/pwa/src/lib/mushafPages.ts` turns `lines.json` into Madinah pages, used by both the full-page reader (`/read/:dutyId`) and the «تحميل الورد» PDF (`lib/wirdPdf.ts`, rendered by the browser itself via an SVG foreignObject (`lib/rasterize.ts`) + jsPDF — html2canvas misplaced the text — built on the device so it works offline). The Hafs font draws the ayah-end number as the medallion itself — don't draw number badges in CSS. The Telegram wird messages' «تحميل الورد» button links to `/?date=…&download=1`, which opens the app with the download button highlighted (a tap is still needed: phones only share/save on a user gesture). Server-side rendering (Cloudflare Browser Rendering) was built and dropped for cost.
- `.gitignore` reserves `apps/mobile/` (React Native) — a mobile app is planned but doesn't exist yet; `createWirdClient` already accepts a `storage` adapter for it.

## Push notifications (FCM)

Firebase project `wird-dhikr` is used **only as the push delivery pipe** — all logic lives in Supabase. Sending goes through the `push-notifications` edge function (FCM HTTP v1, service-account JWT minted in-function); scheduling is pg_cron (`wird-push-dispatch`, every 5 min) → `dispatch_due_campaigns()` (SQL) → pg_net, authenticated with the service-role key stored in **Vault as `wird_dispatch_key`** (never in git; recreate via `vault.create_secret`). The edge function claims a campaign atomically (nulls `next_run_at` first) so a racing cron tick + dashboard click can't double-send; `next_campaign_run()` computes the next occurrence in Asia/Damascus (fixed +03, no DST since 2022). `dispatch_due_campaigns()` also puts any active recurring rule whose `next_run_at` is null back on its next occurrence (the edge function dying mid-send used to silence a daily rule forever); resuming a paused recurring rule recomputes `next_run_at` in `set_campaign_next_run()` (otherwise it fired right after the resume).

Campaigns come in three **shapes**, which is how the dashboard groups them and what the `campaignShape()` helper in `packages/domain/src/notifications.ts` encodes: instant (`now`), one-off (`once` — ends after its single send), and recurring (`daily`/`weekly` — a standing rule). A recurring kind carries `recur_time`; only `weekly` also carries `recur_weekday`. **Adding a recurring kind means touching three places**: `next_campaign_run()` in SQL, the `schedule_kind === 'weekly' || 'daily'` reschedule branch in the edge function (miss it and the rule fires exactly once then goes quiet, which looks identical to it working), and the zod refine in `packages/domain/src/validation.ts`.

PWA receiving: the FCM token is minted against the app's own worker at `/` (`src/sw.ts`), which handles the raw `push` event — **no Firebase SDK in any worker**. `public/firebase-messaging-sw.js` is a **legacy** SDK-free handler kept only for devices that haven't opened the app since the move (their token still points at scope `/firebase-cloud-messaging-push-scope`); the app unregisters it once a token exists on `/`. Don't add features there; delete it once no `fcm_tokens` row lacks a `device_id`. Never call firebase `deleteToken()` — without the legacy worker it re-registers the default one.

**One token per device.** The app writes tokens only through the `register_push_token` RPC (security definer): it takes a stable `device_id` (Dexie `meta`), deletes every other token of that device, and assigns the token to the caller — which is what fixes both "received twice" (a device holding several live tokens) and a shared phone never re-registering (the row belonged to the previous account, so the RLS'd upsert was refused). Sign-out calls `unregister_push_device`. `ensurePushRegistered` re-checks on every open/foreground (single-flight, re-announces at most every 12 h). A daily cron (`wird-push-prune`) drops tokens unseen for 60 days.

**Pushes carry today's wird.** The edge function resolves recipients in SQL (`campaign_profile_ids`, `push_targets` — both return one scalar, since PostgREST caps set-returning RPCs at max-rows) and sends each profile its duties for today (Damascus) in one-letter-key JSON (`SnapshotDuty`, 4 KB push limit; dropped above ~3 KB). The SW writes the snapshot into Dexie (`applyDutySnapshot`), builds the body from it, and the notification links to `/?date=…` — so it opens onto a working checklist offline. Every message has a `mid`; the SW shows a given `mid` once (a repeat still calls `showNotification` on the same tag, silently: iOS revokes subscriptions that receive pushes without displaying). The whole handler runs inside `event.waitUntil` — the old worker didn't return the `showNotification` promise, which is how iOS devices silently stopped receiving. `auto: { kind: 'test' }` lets any signed-in user push to their own devices (the bell sheet's test button); it is the only `auto` kind left. Dashboard shows reach (`last_recipient_count` of `last_target_count` people) and `push_coverage()` (who has no device).

The VAPID key (`VITE_FIREBASE_VAPID_KEY` in `apps/pwa/.env.local`) and the web push cert in the Firebase console are **permanent** — rotating either orphans every token. `FCM_SERVICE_ACCOUNT` (service-account JSON) is an edge-function secret set via `supabase secrets set`. The whole UI stays hidden until the VAPID env var exists (`pushConfigured()`), so a missing config degrades to silence, not errors.

**Sends are DATA-ONLY** (`message.data`, never `message.notification`). A `notification` payload makes the browser/FCM display the push _in addition to_ our worker, so every notification arrived twice. There must be exactly one displayer: `src/sw.ts` — the page has no foreground display path either (with a browser tab and the installed app both open, each window used to show its own copy). Tags are per-campaign (`campaign-<id>`) — a single shared tag made each notification silently replace the last.

**The wird messages are code, not campaigns.** Three fixed messages go out on **push and Telegram**, worded in `supabase/functions/push-notifications/wird-templates.ts` (per channel, `{{name}}`/`{{date}}`/`{{wird}}`/`{{remaining}}`/`{{link}}` placeholders; edit and redeploy the function):

- `morning` — 04:00 Damascus (`wird-morning` cron, `0,15,30 1 * * *` UTC) to every employee with a wird today, finished or not.
- `evening` — 20:00 Damascus (`wird-evening`, `0,15,30 17 * * *` UTC) to every employee not finished today.
- `updated` — today's wird added or changed after 04:00. Statement-level triggers on `duties` (`queue_wird_update_insert` / `_change`, transition tables; a change means category/date/scope, never status) queue the employee in `wird_update_queue`; `flush_wird_updates()` (`wird-updates`, every minute) sends once an entry is 45 s quiet — so saving a day's several categories is one message — and drops anything queued before today's 04:00 (the morning covers it).

SQL reaches the function through `dispatch_wird(kind, profile_ids, dry_run)` (pg_net, 120 s timeout — the 5 s default is shorter than a morning send). Recipients: `wird_recipient_ids()`. Every real send is logged in `wird_runs`; morning/evening **claim** one row per `(kind, day)` (`claim_wird_run`), so the :15/:30 ticks only retry a day that errored or has been stuck 10 min. **Test with `select dispatch_wird('morning', null, true)`** — a dry run resolves and renders (response in `net._http_response`) without sending or logging. Dashboard campaigns are free text only (`showWird` false) — they never append the wird. Every campaign carries a `channel` (`push` | `telegram` | `both`); a `both` campaign may carry its own `telegram_body` (null = Telegram gets `body`). Recurring campaigns and pending one-offs are editable in the dashboard (`campaignIsEditable`). Telegram reaches only employees who tapped Start on the bot (`telegram_chats`).

iOS: push requires the PWA installed to the home screen (≥16.4) and the permission prompt must come from a user tap — hence the `PushNotice` card, never an automatic request. In Safari (not installed) `getPushState()` returns `needs-install` and the card shows the Add-to-Home-Screen steps instead of disappearing.
