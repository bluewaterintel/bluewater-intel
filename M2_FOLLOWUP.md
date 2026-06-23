# Milestone 2 — Auth + User Data (Follow-up)

Milestone 1 (waypoints + ramps) is deployed separately. When you are ready for accounts, cross-device sync, and private spots, complete these steps.

## What you need from Claude

The M1 bundle did **not** include M2 files. Obtain from your Claude backend chat:

| File | Purpose |
|---|---|
| `0002_auth_user_data.sql` | User tables, RLS policies, auth hooks |
| `bw-auth.js` | Client auth module (`BW_SUPABASE_CONFIG`, sign-in/out) |
| `client/CLIENT_PATCH.md` (M2) | HTML wiring for `signIn()`, `signUp()`, sync |

## Deploy order

1. **Apply migrations** — `node scripts/apply-migration.mjs` (runs 0001 + 0002 when present)
2. **Enable Email auth** — Dashboard → Authentication → Providers → Email (decide on email confirmation).
3. **Configure client** — Set `BW_SUPABASE_CONFIG` in `bw-auth.js` (same project URL + anon key as M1).
4. **Apply M2 CLIENT_PATCH** — Replace auth stubs in `index.html` (~line 11413):
   - `signIn()` / `signUp()` currently show UI scaffolding only
   - Wire to `bw-auth.js` Supabase Auth calls
   - Required privacy-text rewrite (M2 Step 6 in patch doc)
5. **Run integrity check** — `npm run integrity`
6. **Redeploy** — `npm run deploy` (regenerates `bw-config.js`, pushes to Netlify)

## Smoke tests (M2)

| Test | Expected |
|---|---|
| Sign up with email | Account created; session persisted |
| Add private waypoint / catch | Stored in `user_waypoints` / catches tables |
| Sign in on second browser | Same user data visible |
| Sign in as different user | No access to first user's private data (RLS) |

## Security reminders

- **Service role key** stays server-side only — never in the client or git.
- **Anon key** is safe in the client; RLS enforces row-level access.
- No silent fabrication — if auth or sync fails, the UI must say so.

## Relationship to later milestones

| Milestone | Scope |
|---|---|
| M2 (this) | Auth, user waypoints, catches, RLS |
| M3 | AI Captain's Brief server endpoint (Anthropic key server-side) |
| M4 | Ocean-data layer — DataSource seam, real SST/chlor/depth/wind, withhold-and-label |
| M5 | Diagnostics vs monetization, consent/DSAR |

See [Bluewater-Intel-Backend-Spec-CONSOLIDATED.md](Bluewater-Intel-Backend-Spec-CONSOLIDATED.md) for the full roadmap.
