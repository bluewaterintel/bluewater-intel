#!/usr/bin/env node
/**
 * Sync Resend SMTP credentials into Supabase Auth (confirmation + reset emails).
 *
 * Auth mail is NOT sent via RESEND_API_KEY in edge functions — Supabase Auth
 * uses its own SMTP settings. If those drift from your live Resend key, signup
 * confirmation emails silently fail even though Supabase sets confirmation_sent_at.
 *
 * Requires in .env:
 *   SUPABASE_ACCESS_TOKEN  (https://supabase.com/dashboard/account/tokens)
 *   RESEND_API_KEY           (re_… from https://resend.com/api-keys)
 *
 * Optional:
 *   AUTH_SMTP_FROM=noreply@bluewaterintel.com
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = "mealpzwbjamkjdrsszqe";
const SITE = "https://app.bluewaterintel.com";
const ENV_PATH = join(ROOT, ".env");

function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, "");
  }
  return out;
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

const env = loadEnv();
const token = env.SUPABASE_ACCESS_TOKEN;
const resendKey = env.RESEND_API_KEY;
const smtpFrom = env.AUTH_SMTP_FROM || "noreply@bluewaterintel.com";
const testTo = process.argv.find((a) => a.startsWith("--test-to="))?.split("=")[1];

if (!token) die("Missing SUPABASE_ACCESS_TOKEN in .env");
if (!resendKey || resendKey.includes("re_...")) {
  die(
    "Missing RESEND_API_KEY in .env\n" +
      "Create one at https://resend.com/api-keys (Sending access) and add:\n" +
      "  RESEND_API_KEY=re_...\n"
  );
}

async function mgmt(path, opts = {}) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!r.ok) die(`Management API ${opts.method || "GET"} ${path} failed (${r.status}): ${body.message || text}`);
  return body;
}

async function verifyResendKey() {
  const r = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${resendKey}` },
  });
  const body = await r.json().catch(() => ({}));
  if (r.status === 401 && /only send emails/i.test(body.message || "")) {
    console.log("Resend key is send-only (OK for SMTP + transactional mail). Skipping domain list.");
    return;
  }
  if (!r.ok) die(`Resend API key rejected (${r.status}): ${body.message || "invalid key"}`);
  const domains = body.data || [];
  const verified = domains.filter((d) => d.status === "verified").map((d) => d.name);
  console.log("Resend domains verified:", verified.length ? verified.join(", ") : "(none — verify bluewaterintel.com first)");
  if (!verified.some((d) => smtpFrom.endsWith("@" + d))) {
    console.warn(`Warning: AUTH_SMTP_FROM (${smtpFrom}) may not match a verified domain.`);
  }
}

async function sendResendTest() {
  if (!testTo) return;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Bluewater Intel <${smtpFrom}>`,
      to: [testTo],
      subject: "Bluewater Intel — Resend SMTP test",
      html: "<p>If you received this, your Resend API key and sender domain are working.</p>",
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) die(`Resend test send failed (${r.status}): ${body.message || JSON.stringify(body)}`);
  console.log(`Resend test email queued to ${testTo} (id: ${body.id})`);
}

async function main() {
  console.log("Checking Resend API key…");
  await verifyResendKey();
  await sendResendTest();

  console.log("Reading current Supabase Auth config…");
  const before = await mgmt("/config/auth");
  console.log("Current SMTP:", {
    enabled: before.external_email_enabled,
    host: before.smtp_host,
    port: before.smtp_port,
    sender: before.smtp_admin_email,
  });

  console.log("Updating Supabase Auth SMTP (Resend)…");
  const patch = {
    external_email_enabled: true,
    mailer_autoconfirm: false,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: resendKey,
    smtp_admin_email: smtpFrom,
    smtp_sender_name: "Bluewater Intel",
    site_url: SITE,
  };
  const after = await mgmt("/config/auth", { method: "PATCH", body: JSON.stringify(patch) });
  console.log("Updated SMTP:", {
    enabled: after.external_email_enabled,
    host: after.smtp_host,
    port: after.smtp_port,
    sender: after.smtp_admin_email,
  });

  console.log("\nDone. Trigger a fresh confirmation:");
  console.log("  • Dashboard → Authentication → Users → Send confirmation");
  console.log("  • Or use the “Resend verification email” button in the app");
  console.log("  • Or: node scripts/sync-auth-smtp.mjs --test-to=you@example.com");
}

main().catch((e) => die(e?.message || String(e)));
