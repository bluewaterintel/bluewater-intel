// ============================================================================
// Bluewater Intel — shared owner-email helper (Resend HTTP API)
//
// One place to send transactional OWNER alerts (dataset drift, new signups).
// This is NOT the Supabase Auth mail path — password-reset / confirmation
// emails are still composed by Supabase and delivered via the Resend SMTP
// integration configured in the Dashboard. This helper is for app-generated
// notifications that go straight to the owner inbox.
//
// SECRETS (Edge Function env):
//   RESEND_API_KEY  — Resend API key (re_…). Required; if unset, sends are
//                     skipped (logged) so the caller never fails on email.
//   ALERT_EMAIL     — recipient. Default info@bluewaterintel.com. Comma-separated
//                     for multiple recipients.
//   ALERT_FROM      — verified sender. Default "Bluewater Intel
//                     <alerts@bluewaterintel.com>" (domain must be verified in
//                     Resend).
// ============================================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function alertRecipients(): string[] {
  return (Deno.env.get("ALERT_EMAIL") ?? "info@bluewaterintel.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function alertFrom(): string {
  return Deno.env.get("ALERT_FROM") ?? "Bluewater Intel <alerts@bluewaterintel.com>";
}

export type OwnerEmail = {
  subject: string;
  html: string;
  /** Plain-text fallback. Optional — Resend derives one if omitted. */
  text?: string;
  /** Override recipients (defaults to ALERT_EMAIL). */
  to?: string[];
};

/**
 * Send an owner notification via Resend. Never throws: email is best-effort, so
 * a mail outage must not break a webhook or a health run. Returns true on a 2xx.
 */
export async function sendOwnerEmail(msg: OwnerEmail): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.warn("email: RESEND_API_KEY unset — skipping send:", msg.subject);
    return false;
  }
  const to = msg.to && msg.to.length ? msg.to : alertRecipients();
  if (!to.length) {
    console.warn("email: no recipients — skipping send:", msg.subject);
    return false;
  }
  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: alertFrom(),
        to,
        subject: msg.subject,
        html: msg.html,
        ...(msg.text ? { text: msg.text } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      console.error("email: Resend send failed", r.status, (await r.text().catch(() => "")).slice(0, 300));
      return false;
    }
    return true;
  } catch (e) {
    console.error("email: Resend send threw", (e as Error)?.message);
    return false;
  }
}

/** Minimal HTML escape for interpolating user-supplied strings into templates. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Shared, on-brand wrapper so owner emails look consistent. */
export function ownerEmailShell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0a1a2e;font-family:'Segoe UI',Arial,sans-serif;color:#e8f4ff">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="font-size:13px;letter-spacing:.14em;color:#6bbfea;font-weight:700;text-transform:uppercase">Bluewater Intel</div>
    <h1 style="font-size:20px;color:#f0f6ff;margin:6px 0 16px">${esc(title)}</h1>
    <div style="background:#0f2444;border:1px solid rgba(107,191,234,.18);border-radius:12px;padding:18px 18px 4px">
      ${bodyHtml}
    </div>
    <div style="font-size:11px;color:#6b8cae;margin-top:16px;line-height:1.5">
      Automated notification from Bluewater Intel. You are receiving this as the app owner.
    </div>
  </div></body></html>`;
}
