// ============================================================================
// Bluewater Intel — Admin API (Edge Function, Deno)
// Deploy: supabase functions deploy admin --no-verify-jwt
//
// Owner-only user management: list/search profiles, view entitlements, update
// subscription fields. Uses the service role for auth.users + profiles; callers
// must present a valid JWT and pass the server-side admin gate (is_owner or
// ADMIN_EMAILS allow-list).
//
// SECRETS: ALLOWED_ORIGINS, ADMIN_EMAILS (optional comma-separated),
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto).
// ============================================================================

import { createClient, type User } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@16";
import { purgeUserAccount } from "../_shared/delete-user.ts";
import { syncStripeEntitlementForUser } from "../_shared/stripe-entitlements.ts";
import { syncRevenueCatEntitlementForUser } from "../_shared/revenuecat.ts";
import {
  compareRoster,
  tallyRoster,
  userMatchesFilter,
  userMatchesQuery,
} from "../_shared/admin-roster.ts";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const stripe = stripeKey ? new Stripe(stripeKey, { apiVersion: "2024-06-20" }) : null;
const rcSecret = Deno.env.get("REVENUECAT_SECRET_API_KEY") ?? "";

const ALLOWED = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const ADMIN_EMAILS = new Set(
  (Deno.env.get("ADMIN_EMAILS") ?? "rnovakwvu@gmail.com,natalienovakm@gmail.com")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

// Reflect the caller's Origin (falling back to the configured list / "*"). Auth
// is enforced by the JWT bearer token + admin gate below, NOT by CORS, and no
// cookies are used — so echoing the origin is safe and, unlike strict matching,
// works for every hostname the app is served from (apex, www., mobile webview).
// Strict matching returned the apex domain for www./webview callers, which the
// browser rejects → the User Admin page showed "Failed to fetch".
function cors(origin: string | null) {
  const allow = origin || (ALLOWED[0] ?? "*");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const VALID_STATUS = new Set(["none", "trialing", "active", "canceled", "lifetime", "past_due"]);
const VALID_INTERVAL = new Set(["month", "year"]);

type ProfileRow = Record<string, unknown>;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

async function requireAdmin(authHeader: string) {
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await supa.auth.getUser();
  if (error || !user) throw new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 });

  const { data: prof } = await supa.from("profiles").select("is_owner").eq("id", user.id).maybeSingle();
  const email = (user.email ?? "").toLowerCase();
  const allowed = !!(prof?.is_owner) || ADMIN_EMAILS.has(email);
  if (!allowed) throw new Response(JSON.stringify({ error: "Admin access required." }), { status: 403 });
  return user;
}

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function profileForUser(admin: ReturnType<typeof adminClient>, userId: string): Promise<ProfileRow | null> {
  const { data } = await admin.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data ?? null;
}

function mergeUser(authUser: User, profile: ProfileRow | null, briefCount: number | null) {
  return {
    id: authUser.id,
    email: authUser.email ?? "",
    email_confirmed: !!authUser.email_confirmed_at,
    created_at: authUser.created_at,
    last_sign_in_at: authUser.last_sign_in_at,
    display_name: (profile?.display_name as string) ?? null,
    home_port: (profile?.home_port as string) ?? null,
    subscription_status: (profile?.subscription_status as string) ?? "none",
    subscription_interval: (profile?.subscription_interval as string) ?? null,
    current_period_end: (profile?.current_period_end as string) ?? null,
    trial_end: (profile?.trial_end as string) ?? null,
    is_owner: !!(profile?.is_owner),
    billing_source: (profile?.billing_source as string) ?? null,
    stripe_customer_id: (profile?.stripe_customer_id as string) ?? null,
    plan_selected_at: (profile?.plan_selected_at as string) ?? null,
    updated_at: (profile?.updated_at as string) ?? null,
    briefs_today: briefCount ?? 0,
    has_profile: !!profile,
  };
}

async function loadAllAuthUsers(admin: ReturnType<typeof adminClient>): Promise<User[]> {
  const collected: User[] = [];
  const perPage = 200;
  for (let page = 1; page <= 30; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data.users ?? [];
    collected.push(...batch);
    if (batch.length < perPage) break;
  }
  return collected;
}

async function loadAllProfiles(admin: ReturnType<typeof adminClient>): Promise<ProfileRow[]> {
  const all: ProfileRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 20000; from += pageSize) {
    const { data, error } = await admin.from("profiles").select("*").range(from, from + pageSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as ProfileRow[];
    all.push(...batch);
    if (batch.length < pageSize) break;
  }
  return all;
}

async function loadRoster(admin: ReturnType<typeof adminClient>) {
  const [authUsers, profiles] = await Promise.all([loadAllAuthUsers(admin), loadAllProfiles(admin)]);
  const profileMap = new Map<string, ProfileRow>();
  for (const p of profiles) profileMap.set(String(p.id), p);
  return authUsers.map((u) => mergeUser(u, profileMap.get(u.id) ?? null, 0));
}

async function listUsers(
  admin: ReturnType<typeof adminClient>,
  q: string,
  limit: number,
  offset: number,
  filter: string,
  sort: string,
) {
  const roster = await loadRoster(admin);
  const matched = roster.filter((u) => userMatchesQuery(u, q) && userMatchesFilter(u, filter));
  matched.sort((a, b) => compareRoster(a, b, sort));
  const page = matched.slice(offset, offset + limit);
  const ids = page.map((u) => u.id);
  if (ids.length) {
    const { data: usage } = await admin.from("user_brief_usage").select("user_id, count")
      .eq("day", todayUtc()).in("user_id", ids);
    const briefMap = new Map<string, number>();
    for (const row of usage ?? []) briefMap.set(row.user_id as string, row.count as number);
    for (const u of page) u.briefs_today = briefMap.get(u.id) ?? 0;
  }
  return { users: page, total: matched.length, limit, offset };
}

async function stats(admin: ReturnType<typeof adminClient>) {
  return tallyRoster(await loadRoster(admin));
}

function sanitizePatch(raw: Record<string, unknown>) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("display_name" in raw) patch.display_name = raw.display_name == null ? null : String(raw.display_name).slice(0, 120);
  if ("home_port" in raw) patch.home_port = raw.home_port == null ? null : String(raw.home_port).slice(0, 120);
  if ("is_owner" in raw) patch.is_owner = !!raw.is_owner;
  if ("subscription_status" in raw) {
    const st = String(raw.subscription_status ?? "none");
    if (!VALID_STATUS.has(st)) throw new Error(`Invalid subscription_status: ${st}`);
    patch.subscription_status = st;
  }
  if ("subscription_interval" in raw) {
    const iv = raw.subscription_interval;
    if (iv == null || iv === "") patch.subscription_interval = null;
    else {
      const s = String(iv);
      if (!VALID_INTERVAL.has(s)) throw new Error(`Invalid subscription_interval: ${s}`);
      patch.subscription_interval = s;
    }
  }
  if ("current_period_end" in raw) patch.current_period_end = isoOrNull(raw.current_period_end);
  if ("trial_end" in raw) patch.trial_end = isoOrNull(raw.trial_end);
  if ("stripe_customer_id" in raw) {
    patch.stripe_customer_id = raw.stripe_customer_id == null || raw.stripe_customer_id === ""
      ? null
      : String(raw.stripe_customer_id).slice(0, 80);
  }
  return patch;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const CORS = cors(origin);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let caller;
  try {
    caller = await requireAdmin(req.headers.get("Authorization") ?? "");
  } catch (e) {
    if (e instanceof Response) {
      const body = await e.json();
      return new Response(JSON.stringify(body), { status: e.status, headers: { ...CORS, "Content-Type": "application/json" } });
    }
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }

  const action = String(body.action ?? "");
  const admin = adminClient();

  try {
    if (action === "stats") {
      return json({ stats: await stats(admin) });
    }

    if (action === "list") {
      const q = String(body.q ?? "");
      const filter = String(body.filter ?? "all");
      const sort = String(body.sort ?? "newest");
      const limit = Math.min(200, Math.max(1, Number(body.limit) || 80));
      const offset = Math.max(0, Number(body.offset) || 0);
      return json(await listUsers(admin, q, limit, offset, filter, sort));
    }

    if (action === "get") {
      const userId = String(body.userId ?? "");
      if (!userId) return json({ error: "userId required" }, 400);
      const { data: { user }, error } = await admin.auth.admin.getUserById(userId);
      if (error || !user) return json({ error: "User not found" }, 404);
      const profile = await profileForUser(admin, userId);
      const { data: usage } = await admin.from("user_brief_usage").select("count")
        .eq("user_id", userId).eq("day", todayUtc()).maybeSingle();
      return json({ user: mergeUser(user, profile, usage?.count ?? 0) });
    }

    if (action === "update") {
      const userId = String(body.userId ?? "");
      if (!userId) return json({ error: "userId required" }, 400);
      const patch = sanitizePatch((body.patch as Record<string, unknown>) ?? {});
      const { error } = await admin.from("profiles").upsert({ id: userId, ...patch }, { onConflict: "id" });
      if (error) throw error;
      const { data: { user } } = await admin.auth.admin.getUserById(userId);
      const profile = await profileForUser(admin, userId);
      const { data: usage } = await admin.from("user_brief_usage").select("count")
        .eq("user_id", userId).eq("day", todayUtc()).maybeSingle();
      return json({ ok: true, user: user ? mergeUser(user, profile, usage?.count ?? 0) : null });
    }

    if (action === "sync_stripe") {
      const userId = String(body.userId ?? "");
      if (!userId) return json({ error: "userId required" }, 400);
      if (!stripe) return json({ error: "Stripe not configured." }, 503);
      const { data: { user }, error } = await admin.auth.admin.getUserById(userId);
      if (error || !user) return json({ error: "User not found" }, 404);
      const result = await syncStripeEntitlementForUser(admin, stripe, userId, user.email);
      const profile = await profileForUser(admin, userId);
      const { data: usage } = await admin.from("user_brief_usage").select("count")
        .eq("user_id", userId).eq("day", todayUtc()).maybeSingle();
      return json({ ok: true, sync: result, user: mergeUser(user, profile, usage?.count ?? 0) });
    }

    if (action === "sync_revenuecat") {
      const userId = String(body.userId ?? "");
      if (!userId) return json({ error: "userId required" }, 400);
      if (!rcSecret || rcSecret.includes("YOUR_")) {
        return json({ error: "RevenueCat secret key not configured." }, 503);
      }
      const { data: { user }, error } = await admin.auth.admin.getUserById(userId);
      if (error || !user) return json({ error: "User not found" }, 404);
      const result = await syncRevenueCatEntitlementForUser(admin, userId, rcSecret);
      const profile = await profileForUser(admin, userId);
      const { data: usage } = await admin.from("user_brief_usage").select("count")
        .eq("user_id", userId).eq("day", todayUtc()).maybeSingle();
      return json({ ok: true, sync: result, user: mergeUser(user, profile, usage?.count ?? 0) });
    }

    if (action === "preset") {
      const userId = String(body.userId ?? "");
      const preset = String(body.preset ?? "");
      if (!userId || !preset) return json({ error: "userId and preset required" }, 400);
      const now = new Date();
      let patch: Record<string, unknown> = { updated_at: now.toISOString() };
      if (preset === "grant_pro") {
        const end = new Date(now); end.setFullYear(end.getFullYear() + 1);
        patch = { ...patch, subscription_status: "active", subscription_interval: "year", current_period_end: end.toISOString(), trial_end: null };
      } else if (preset === "grant_trial") {
        const end = new Date(now); end.setDate(end.getDate() + 7);
        patch = { ...patch, subscription_status: "trialing", subscription_interval: "month", trial_end: end.toISOString() };
      } else if (preset === "revoke") {
        patch = { ...patch, subscription_status: "canceled", subscription_interval: null, current_period_end: null, trial_end: null, is_owner: false };
      } else if (preset === "grant_owner") {
        const end = new Date(now); end.setFullYear(end.getFullYear() + 100);
        patch = { ...patch, is_owner: true, subscription_status: "active", current_period_end: end.toISOString(), trial_end: end.toISOString() };
      } else {
        return json({ error: "Unknown preset" }, 400);
      }
      const { error } = await admin.from("profiles").upsert({ id: userId, ...patch }, { onConflict: "id" });
      if (error) throw error;
      const { data: { user } } = await admin.auth.admin.getUserById(userId);
      const profile = await profileForUser(admin, userId);
      const { data: usage } = await admin.from("user_brief_usage").select("count")
        .eq("user_id", userId).eq("day", todayUtc()).maybeSingle();
      return json({ ok: true, user: user ? mergeUser(user, profile, usage?.count ?? 0) : null });
    }

    if (action === "delete") {
      const userId = String(body.userId ?? "");
      if (!userId) return json({ error: "userId required" }, 400);
      if (userId === caller.id) {
        return json({ error: "To delete your own account, use Account → Delete my account." }, 400);
      }
      await purgeUserAccount(admin, userId, { stripe, strictBilling: false });
      return json({ ok: true, deleted: userId });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("admin error", (e as Error)?.message);
    return json({ error: (e as Error)?.message || "Admin request failed" }, 500);
  }
});
