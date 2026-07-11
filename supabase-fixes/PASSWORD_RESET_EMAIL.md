# Password reset emails not arriving

If **Forgot password?** shows “check your inbox” but no email arrives, the app request is usually succeeding — delivery is failing on the Supabase side.

## Quick checks

1. **Authentication → Users** — confirm the account exists and the email address is correct (no typo, no alternate signup email).
2. **Authentication → Logs** — look for `user.recovery_requested` or mail errors around the time you tried reset.
3. **Spam / promotions** — Supabase’s built-in mail often lands in spam until custom SMTP is configured.

## Required Dashboard configuration

Project: `mealpzwbjamkjdrssqe`  
Production app: `https://app.bluewaterintel.com`

### 1. Redirect URLs

**Authentication → URL Configuration**

- **Site URL:** `https://app.bluewaterintel.com`
- **Redirect URLs** (add if missing):
  - `https://app.bluewaterintel.com/?recovery=1`
  - `https://app.bluewaterintel.com/?confirmed=1`
  - `http://127.0.0.1:3000/?recovery=1` (local dev)
  - `http://localhost:3000/?recovery=1` (local dev)

The reset link in email must redirect to `/?recovery=1` so the app opens the “Choose a new password” screen.

### 2. Reset password email template

**Authentication → Email Templates → Reset password**

- **Subject:** `Reset your Bluewater Intel password`
- **Body:** paste HTML from `supabase/templates/recovery.html`
- Link must use `{{ .ConfirmationURL }}`

### 3. Custom SMTP via Resend (critical for delivery)

Supabase Auth sends password-reset and signup emails. **Configure Resend inside Supabase** — you do not send these from the Resend dashboard or API directly.

1. In **Resend** → **Domains** — verify `bluewaterintel.com` (or your sending domain).
2. In **Resend** → **API Keys** — create a key (starts with `re_`).
3. In **Supabase** → **Authentication → SMTP Settings** → enable custom SMTP:

| Field | Resend value |
|-------|----------------|
| Host | `smtp.resend.com` |
| Port | `465` (SSL) or `587` (STARTTLS) |
| Username | `resend` |
| Password | your Resend API key (`re_…`) |
| Sender email | `noreply@bluewaterintel.com` (must use verified domain) |
| Sender name | `Bluewater Intel` |

Supabase composes the email (using your reset/confirm templates) and delivers it through Resend SMTP. Check delivery in **Resend → Emails** after triggering a reset.

## App behavior (already wired)

- **Forgot password?** calls `BW_AUTH.resetPassword(email)` with redirect `https://app.bluewaterintel.com/?recovery=1`
- User clicks email link → Supabase establishes a recovery session → app shows the password form
- **Update password** calls `BW_AUTH.updatePassword(newPassword)` and signs the user in

## Manual fallback (owner)

If a user is blocked and SMTP is not fixed yet:

**Authentication → Users → select user → Send password recovery**  
or set a temporary password from the user detail panel.
