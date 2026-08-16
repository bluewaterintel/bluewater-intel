# Supabase auth email templates

Apply in the Supabase Dashboard under **Authentication → Email Templates**, or via CLI when using local Supabase (`config.toml` references these files).

## Confirm signup

**Template:** Confirm signup

### Subject
```
Please confirm your email for Bluewater Intel registration
```

### Body
Use the HTML in `supabase/templates/confirmation.html`. The confirmation link must use `{{ .ConfirmationURL }}`.

### Redirect URL
Ensure **Confirm email** is enabled and the redirect URL is allow-listed:
`https://app.bluewaterintel.com/?confirmed=1`

---

## Reset password

**Template:** Reset password

### Subject
```
Reset your Bluewater Intel password
```

### Body
Use the HTML in `supabase/templates/recovery.html`. The reset link must use `{{ .ConfirmationURL }}`.

### Redirect URL
Allow-list in **Authentication → URL Configuration**:
`https://app.bluewaterintel.com/?recovery=1`

The app opens the “Choose a new password” screen when the user returns on that URL (and on the `PASSWORD_RECOVERY` auth event).

---

## SMTP (production)

Built-in Supabase mail often does not reach real inboxes. Configure **Authentication → SMTP Settings** with SendGrid, Resend, SES, or similar before relying on reset or confirmation email in production.

If you rotate your Resend API key, update **both** Supabase Auth SMTP and edge-function secrets:

```bash
npm run sync:auth-smtp          # refreshes Supabase Auth SMTP from RESEND_API_KEY
npm run deploy:health           # refreshes edge-function RESEND_API_KEY secret
```

See `supabase-fixes/PASSWORD_RESET_EMAIL.md` for step-by-step Dashboard checks.
