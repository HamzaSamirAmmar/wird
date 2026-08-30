# AGENTS.md

**Wird (ورد)** — daily Quran memorization duty tracker for a workplace: supervisors assign per-day memorization/review ranges to groups; employees track checklist progress in an offline-capable Arabic PWA. Backend is Supabase (Postgres with triggers/RLS + edge functions). pnpm + Turborepo monorepo.

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
node packages/quran-data/scripts/generate-quran-data.mjs   # regenerates pageStarts.ts + apps/pwa/public/quran-uthmani.json from tanzil.net
node icon-src/generate-icons.mjs                            # from inside apps/dashboard or apps/pwa; renders @wird/brand mark to public/*.png via sharp

# First-supervisor bootstrap (needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SEED_SUPERVISOR_USERNAME/PASSWORD/NAME)
pnpm db:seed-supervisor
```

**There are no tests.** The verification loop is `pnpm typecheck && pnpm lint && pnpm build`.

Env: each app needs `apps/<app>/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). The client throws at import time if missing.

## Layout

- `apps/dashboard` (@wird/dashboard) — supervisor web app: groups, users, day-by-day duty assignment, follow-up.
- `apps/pwa` (@wird/pwa) — employee app: duty checklist, mushaf reader, leaderboard. Installable PWA with offline support.
- `packages/domain` — shared types, zod schemas, duty category definitions, username→email logic. No framework deps.
- `packages/quran-data` — surah metadata + 604-page mushaf page index.
- `packages/supabase-client` — typed client factory (`createWirdClient`), username sign-in, `database.types.ts`.
- `packages/ui-web` — shared React presentational components.
- `packages/design-tokens` — colors/typography/spacing + `theme.css`.
- `packages/brand` — brand mark geometry (mjs) shared by both apps' icon generation.
- `supabase/` — SQL migrations, Deno edge functions (`functions/`), supervisor seed script.

Workspace packages expose **raw TS source** (`main: src/index.ts`), no build/dist. Changes are picked up instantly by the Vite apps; `import` uses `@wird/*` names.

Stack per app: React 19, react-router-dom v7 (declarative `<Routes>`; no data loaders), Tailwind CSS v4 (via `@tailwindcss/vite`, no tailwind config file), react-hook-form + zod (dashboard), oxlint (not eslint).

## Backend architecture — where the business logic lives

Most write-path logic is in **Postgres triggers**, not app code (`supabase/migrations/20260827074248_initial_schema.sql` and later migrations). Do not try to replicate these in TS:

- **Fan-out**: inserting a `duty_group_assignments` row auto-creates one `duties` row per _active employee_ in the group (`fanout_group_assignment`). Apps only ever write to `duty_group_assignments`.
- **Propagate**: updating a group assignment propagates scope/date/category to its **still-`pending`** duties only, and reseeds their checklists (`propagate_group_assignment_update`). Duties already `in_progress`/`completed` are intentionally left alone.
- **Deleting** a group assignment cascades to its duties (FK is `on delete cascade` — deliberately changed from SET NULL by a migration; don't revert).
- **Checklist**: a new duty's `duty_step_progress` rows are seeded from `duty_category_steps` (`seed_duty_steps`).
- **Status is derived**: `duties.status` is computed from checklist counts by `sync_duty_status`. Employees toggle `duty_step_progress.is_completed`; nobody writes `status` directly.

RLS is on every table (`is_supervisor()` helper). Employees see only their own group/duties. Aggregates that need cross-employee reads (leaderboard, follow-up, streaks) are `security definer` RPCs in `20260830120000_leaderboard.sql` (`group_leaderboard`, `duty_followup`, `employee_current_streak`) that return only counts + names — the pattern for any new cross-user read model. No service-role keys in the apps.

`packages/supabase-client/src/database.types.ts` must be kept in sync with migrations (regenerate with `supabase gen types` after schema changes) — it's committed, not generated at build time.

### Sync gotchas that have caused real bugs

- `duty_group_assignments` has a unique `(group_id, category, due_date)` constraint: the dashboard edits a group's whole day at once, so one row per category per day is a hard invariant.
- `propagate_group_assignment_update` deletes and re-inserts `duty_step_progress` rows with **new ids**. The PWA cache refresh therefore deletes stale cached steps before `bulkPut` (see `apps/pwa/src/lib/duties.ts`) — a plain upsert renders the checklist twice.
- The PWA sync window is ±7 days around today and must stay ≥ what the UI can display (the Saturday-first week strip reaches 6 days back), or real duties render as "no duties".

## Cross-cutting conventions

- **Arabic-first, RTL.** All user-facing strings are inline Arabic literals (e.g. `'اسم المستخدم أو كلمة المرور غير صحيحة'`); `<html lang="ar" dir="rtl">`. There is no i18n framework — don't introduce one or translate strings to English.
- **Usernames, not emails.** Supabase Auth requires an email; usernames map deterministically to `<username>@wird.local` (`packages/domain/src/username.ts`, pattern `^[a-z0-9_.]{3,32}$`). Never surface emails in UI or send mail.
- **`must_change_password`**: employees created by the supervisor get a generated password; `true` forces a redirect to the change-password screen after login.
- **Case mapping is manual**: DB columns are snake_case, domain types (`packages/domain/src/types.ts`) are camelCase. Each app converts at the fetch boundary (`toProfile()` in auth-context, mappings in `lib/duties.ts`). New columns need both sides updated.
- **Duty categories are fixed** (`new_memorization`, `minor_review`, `major_review`) and their step definitions are **duplicated** in `packages/domain/src/dutyCategories.ts` and the `duty_category_steps` seed in SQL — keep them in sync.
- **Dates are local calendar days** (`YYYY-MM-DD`), never instants. Use the helpers in each app's `src/lib/dates.ts` (`todayISO`, `addDays`); `Date.toISOString()` resolves to the UTC day and is off-by-one east of Greenwich. Weeks start **Saturday**.
- **Quran text asset**: `apps/pwa/public/quran-uthmani.json` (~1.3 MB, 6236 ayahs) is precached by the service worker (`maximumFileSizeToCacheInBytes` was raised for it); omitting it from precache makes the mushaf reader online-only. Data offline-ability is handled in-app via Dexie/IndexedDB (cache + outbox in `apps/pwa/src/lib/offline.ts`), deliberately NOT via SW runtime caching of Supabase API responses.
- **Edge functions are Deno** (`supabase/functions/*`), deployed as **self-contained single files** — CORS headers are inlined on purpose (see comment in `create-employee/index.ts`); `_shared/cors.ts` exists but is not imported. `create-employee` re-implements username validation because it can't import workspace packages.
- Account creation can't be done from the apps (creating an auth user needs the service role). It goes through the `create-employee` edge function (verifies the caller is a supervisor via their own JWT, then writes with the service-role client). The **first** supervisor is bootstrapped by `supabase/seed/seed-supervisor.ts` to break that chicken-and-egg.
- Supabase local dev: `supabase/config.toml` lists `./seed.sql` as the seed file but it doesn't exist — `supabase db reset` will not find a seed; supervisor bootstrap is done via the script above instead.
- `.gitignore` reserves `apps/mobile/` (React Native) — a mobile app is planned but doesn't exist yet; `createWirdClient` already accepts a `storage` adapter for it.

## Push notifications (FCM)

Firebase project `wird-dhikr` is used **only as the push delivery pipe** — all logic lives in Supabase. Sending goes through the `push-notifications` edge function (FCM HTTP v1, service-account JWT minted in-function); scheduling is pg_cron (`wird-push-dispatch`, every 5 min) → `dispatch_due_campaigns()` (SQL) → pg_net, authenticated with the service-role key stored in **Vault as `wird_dispatch_key`** (never in git; recreate via `vault.create_secret`). The edge function claims a campaign atomically (nulls `next_run_at` first) so a racing cron tick + dashboard click can't double-send; `next_campaign_run()` computes the next occurrence in Asia/Damascus (fixed +03, no DST since 2022). The Friday 08:00 reminder is a seeded campaign row, not code.

PWA receiving: `public/firebase-messaging-sw.js` is a **hand-written static file** registered by the FCM SDK at scope `/firebase-cloud-messaging-push-scope` — that different scope is what lets it coexist with the Workbox SW at `/`. It's excluded from Workbox precache via `globIgnores`. Its compat-SDK CDN version must stay in sync with the `firebase` npm version in `apps/pwa`. Tokens live in `fcm_tokens` (one row per device); `ensurePushRegistered` upserts idempotently on every app open (firebase v12 removed `onTokenRefresh`). The VAPID key (`VITE_FIREBASE_VAPID_KEY` in `apps/pwa/.env.local`) and the web push cert in the Firebase console are **permanent** — rotating either orphans every token. `FCM_SERVICE_ACCOUNT` (service-account JSON) is an edge-function secret set via `supabase secrets set`. The whole UI stays hidden until the VAPID env var exists (`pushConfigured()`), so a missing config degrades to silence, not errors.

iOS: push requires the PWA installed to the home screen (≥16.4) and the permission prompt must come from a user tap — hence the `PushNotice` card, never an automatic request.
