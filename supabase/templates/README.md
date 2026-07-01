# Supabase auth email — confirmation template

Apply in the Supabase Dashboard (**Authentication → Email Templates → Confirm signup**), or via CLI when using local Supabase.

## Subject
```
Please confirm your email for Bluewater Intel registration
```

## Body
Use the HTML in `supabase/templates/confirmation.html`. The confirmation link must use `{{ .ConfirmationURL }}`.

## Redirect URL
Ensure **Confirm email** is enabled and the redirect URL is allow-listed:
`https://app.bluewaterintel.com/?confirmed=1`
