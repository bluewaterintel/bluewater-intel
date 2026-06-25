# Fixes — home port persistence + password reset

Two gaps in the M2 wiring. Both are client-side additions to `bw-auth.js` plus
small app hooks. No schema change needed (the `profiles.home_port` column already
exists from migration 0002).

============================================================================
## FIX 1 — Home port not saved across sign-out/sign-in
============================================================================

Cause: `bw-auth.js` never reads or writes the profile, and nothing saves the
port when the user picks it. The column exists; it was just never wired.

### 1a. Add profile read/write to `bw-auth.js`

Add these functions inside the IIFE and expose them on `window.BW_AUTH`:

```js
async function fetchProfile() {
  const { data, error } = await sb.from("profiles")
    .select("display_name, home_port, units").eq("id", currentUser.id).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function saveProfile(patch) {
  // patch: { home_port?, display_name?, units? }
  const row = { id: currentUser.id, ...patch };
  const { error } = await sb.from("profiles").upsert(row, { onConflict: "id" });
  if (error) throw error;
}
```

Add `fetchProfile, saveProfile` to the `window.BW_AUTH = { … }` export.

### 1b. Load home port on sign-in

In `bwOnSignedIn(user)` (the hydrate function from the M2 patch), add near the top:

```js
  try {
    const profile = await window.BW_AUTH.fetchProfile();
    if (profile && profile.home_port && typeof selectPort === "function") {
      // restore the saved port as the active port
      selectPort(profile.home_port);
    }
  } catch (e) { console.error("profile load failed", e); }
```

> Use whatever the app's real "set active port" entry point is. If it's not
> `selectPort(name)`, point this at the correct function. The value stored is the
> port key string (e.g. "Virginia Beach, VA") — same string used in PORTS.

### 1c. Save home port when the user selects it

Find where the app sets the active port (anchor: the `selectPort` function, or
the port dropdown's change handler). After `activePort` is updated, add:

```js
  // Persist the choice to the account so it restores on next sign-in.
  if (window.BW_AUTH && window.BW_AUTH.isSignedIn()) {
    window.BW_AUTH.saveProfile({ home_port: activePort }).catch(e => console.error("save port", e));
  }
```

Now the port round-trips: pick it → saved to profile → restored on next sign-in.

============================================================================
## FIX 2 — Forgot / reset password
============================================================================

Supabase Auth handles this end to end — no extra service needed. Two pieces:
trigger the reset email, and handle the link the user clicks.

### 2a. Dashboard config (manual, one-time)

- Authentication → URL Configuration → add your site URL (e.g.
  `https://yourapp.com`) to **Redirect URLs**.
- Authentication → Email Templates → "Reset Password": confirm it's enabled.
  (The default template works; customize branding later.)

### 2b. "Forgot password?" in the sign-in gate

Add to `auth-gate.html` below the submit button:

```html
<div style="text-align:center;margin-top:10px">
  <a id="bw-auth-forgot" href="#" style="color:#7dd3fc;font-size:12.5px;text-decoration:none">Forgot password?</a>
</div>
```

And in the gate's script:

```js
const forgot = document.getElementById("bw-auth-forgot");
forgot.addEventListener("click", async (e) => {
  e.preventDefault();
  const em = email.value.trim();
  if (!em) return showErr("Enter your email above first, then tap Forgot password.");
  try {
    await window.BW_AUTH.resetPassword(em);
    showErr("Password reset email sent. Check your inbox.");
  } catch (err) { showErr(err?.message || "Could not send reset email."); }
});
```

### 2c. Add reset functions to `bw-auth.js`

```js
async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,  // user returns here to set a new password
  });
  if (error) throw error;
}

async function updatePassword(newPassword) {
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
```

Expose both on `window.BW_AUTH`.

### 2d. Handle the return link (set new password)

When the user clicks the email link, Supabase sends them back to your site with a
recovery session. Add this once, where the app initializes auth:

```js
window.BW_AUTH._sb.auth.onAuthStateChange(async (event) => {
  if (event === "PASSWORD_RECOVERY") {
    const pw = prompt("Enter a new password (min 6 characters):");
    if (pw && pw.length >= 6) {
      try { await window.BW_AUTH.updatePassword(pw); alert("Password updated. You're signed in."); }
      catch (e) { alert("Could not update password: " + (e.message || e)); }
    }
  }
});
```

> A `prompt()` is the minimal version. For production, replace with a small inline
> form (two password fields + confirm) for a better experience — but the logic is
> identical: capture the new password, call `updatePassword`.
