# RevenueCat → Supabase (iOS + Android)

Bluewater uses **RevenueCat V2 secret keys** on the server. V1 REST (`/v1/subscribers/…`) returns **403** with those keys; edge functions must have **`REVENUECAT_PROJECT_ID`** (`proj_…`) and call the **V2 API**.

This applies to **Google Play (Android)** and **App Store (iOS)**. The mobile apps only embed the **public** SDK keys (`goog_…` / `appl_…` in `.env`). Server-side sync uses the **secret** key.

---

## 1. RevenueCat dashboard

1. **Project settings → General** — copy **Project ID** (`proj_…`).
2. **Project settings → API keys → + New**
   - Choose **V2**
   - Permission: **Customer information → Read**
   - Copy the **Secret** key (`sk_…`). Do not commit it.
3. **Integrations → Webhooks** (if not already):
   - URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/revenuecat-webhook`
   - Authorization header: `Bearer <same value as REVENUECAT_WEBHOOK_AUTH>`
   - Send subscription events

Public SDK keys (for local builds / Xcode Cloud) stay in repo `.env`:

- `REVENUECAT_IOS_API_KEY=appl_…`
- `REVENUECAT_ANDROID_API_KEY=goog_…`

See also `docs/IOS.md` §6.3–6.4 for offerings and iOS-specific setup.

---

## 2. Database: allow `google` billing source

Android Play subscriptions write `billing_source = 'google'`. If the DB still only allows `stripe` and `apple` (migration `0015_apple_iap_billing.sql`), sync will fail with:

`violates check constraint "profiles_billing_source_check"`

Apply **`supabase/migrations/0021_google_billing_source.sql`** once:

- **Supabase Dashboard → SQL → New query** — paste the migration file and run, or  
- `npx supabase db push` from a machine whose migration history matches production (see team runbook).

---

## 3. Supabase secrets (one-time)

From your Mac, in the repo root (with `.env` containing `SUPABASE_ACCESS_TOKEN`):

```bash
cd /Users/ronaldnovak/Projects/bluewater-intel
npx supabase link --project-ref mealpzwbjamkjdrsszqe

npx supabase secrets set \
  REVENUECAT_SECRET_API_KEY=sk_your_v2_secret \
  REVENUECAT_PROJECT_ID=proj_your_project_id \
  REVENUECAT_WEBHOOK_AUTH=your-long-random-string
```

Or set the same three names in **Supabase Dashboard → Project Settings → Edge Functions → Secrets**.

---

## 4. Deploy edge functions

After secrets are set, deploy the functions that read RevenueCat:

```bash
npm run deploy:stripe
# or manually:
npx supabase functions deploy admin --no-verify-jwt
npx supabase functions deploy revenuecat-webhook --no-verify-jwt
npx supabase functions deploy iap-sync
```

Functions that require **`REVENUECAT_PROJECT_ID`**:

| Function | Purpose |
|----------|---------|
| `iap-sync` | App calls after purchase/restore (iOS + Android) |
| `admin` (`sync_revenuecat`) | Owner User Admin → sync one user |
| `revenuecat-webhook` | RevenueCat push events (uses webhook mapping, not V2 REST) |

If `REVENUECAT_PROJECT_ID` is missing, **`iap-sync`** returns 503 and the Mac script `sync-revenuecat-user-by-email.mjs` cannot use V2.

---

## 5. Fix one user’s profile (e.g. wrong “Apple” on Android)

**Option A — Android/iOS app (preferred)**  
Sign in → complete purchase or **Restore purchases**. The app POSTs to **`iap-sync`**, which pulls V2 subscriptions and sets `billing_source` to `google` or `apple`.

**Option B — Owner admin**  
User Admin → find the user → **Sync RevenueCat** (requires secrets + deploy from §2–3).

**Option C — Mac script** (service role + RC secrets in `.env`):

```bash
# .env must include REVENUECAT_PROJECT_ID=proj_… (not only the secret key)
node scripts/sync-revenuecat-user-by-email.mjs info@bluewaterintel.com
```

---

## 6. Verify

- **RevenueCat** → Customers → search by Supabase user UUID (same as `auth.users.id`).
- **Supabase** → `profiles` row: `billing_source` should be `google` for Play (`GPA.…` order ids) or `apple` for App Store.
- **Owner dashboard** Google tile counts `billing_source = google` with an active/trialing/past_due/lifetime status.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `RevenueCat API 403` / code `7723` | V2 secret used without `REVENUECAT_PROJECT_ID`, or V1 API called |
| `iap-sync` 503 project id | Set `REVENUECAT_PROJECT_ID` in Supabase secrets and redeploy `iap-sync` |
| Android shows “Billed by Apple” | Profile still `billing_source: apple` — run §5 after §2–4 |
| Admin “Sync RevenueCat” fails | Same as above; redeploy **`admin`** after setting project id |
| Sync error `profiles_billing_source_check` | Run migration **§2** so `google` is allowed |
