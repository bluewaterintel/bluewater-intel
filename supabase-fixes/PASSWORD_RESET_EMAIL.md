# Auth emails not arriving (signup confirmation + password reset)

If signup shows “check your email” or **Forgot password?** succeeds but nothing arrives, the app request is usually fine — **delivery is failing between Supabase Auth and Resend SMTP**.

## Quick diagnosis

1. **Authentication → Users** — find the account. If `confirmation_sent_at` is set but the inbox is empty, SMTP/Resend delivery failed (not the app).
2. **Authentication → Logs** — look for mail/SMTP errors around signup time.
3. **Resend → Emails** — filter by recipient. Auth mail sent via Supabase SMTP appears here when delivery is working.
4. **Spam / Promotions** — still worth checking.

## Fix SMTP (most common regression)

Supabase Auth SMTP is **separate** from `RESEND_API_KEY` on edge functions. If you rotate the Resend API key, you must update **both**:

- Supabase → **Authentication → SMTP Settings** (password field = `re_…` key)
- Edge function secrets (`npm run deploy:health` or `supabase secrets set RESEND_API_KEY=…`)

From this repo (requires `RESEND_API_KEY` + `SUPABASE_ACCESS_TOKEN` in `.env`):

```bash
npm run sync:auth-smtp
# optional smoke test to your inbox:
node scripts/sync-auth-smtp.mjs --test-to=you@example.com
```

Or reconnect: [Resend → Integrations → Supabase](https://resend.com/settings/integrations) → **Configure SMTP Integration**.

### Manual SMTP values (Resend)

| Field | Value |
|-------|--------|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API key (`re_…`) |
| Sender email | `noreply@bluewaterintel.com` (verified domain) |
| Sender name | `Bluewater Intel` |

## Redirect URLs

**Authentication → URL Configuration**

- **Site URL:** `https://app.bluewaterintel.com`
- **Redirect URLs:**
  - `https://app.bluewaterintel.com/**`
  - `https://app.bluewaterintel.com/?confirmed=1`
  - `https://app.bluewaterintel.com/?recovery=1`
  - `com.bluewaterintel.app://*`
  - `http://localhost/**`

## Email templates

**Authentication → Email Templates**

- **Confirm signup** — body from `supabase/templates/confirmation.html`, link must use `{{ .ConfirmationURL }}`
- **Reset password** — body from `supabase/templates/recovery.html`

## Manual fallback

**Authentication → Users → select user → Send confirmation** (or Send password recovery).
