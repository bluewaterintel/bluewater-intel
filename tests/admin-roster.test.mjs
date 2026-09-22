#!/usr/bin/env node
/**
 * Owner admin roster: plan filters, Apple vs Stripe counts, and paging hooks.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  compareRoster,
  tallyRoster,
  userMatchesFilter,
  userMatchesQuery,
} from "../supabase/functions/_shared/admin-roster.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const adminFn = readFileSync(join(root, "supabase/functions/admin/index.ts"), "utf8");
const revenuecat = readFileSync(join(root, "supabase/functions/_shared/revenuecat.ts"), "utf8");
const rcSyncDecls = revenuecat.match(/function syncRevenueCatEntitlementForUser/g) ?? [];
assert.equal(rcSyncDecls.length, 1, "a second declaration makes the admin function fail to boot");
const core = readFileSync(join(root, "bw-core.js"), "utf8");
const html = readFileSync(join(root, "index.html"), "utf8");

function u(partial) {
  return {
    id: "id",
    email: "a@example.com",
    created_at: "2026-01-01T00:00:00Z",
    display_name: null,
    subscription_status: "none",
    billing_source: null,
    is_owner: false,
    has_profile: true,
    ...partial,
  };
}

const roster = [
  u({ id: "1", email: "stripe@example.com", created_at: "2026-03-01T00:00:00Z", subscription_status: "active", billing_source: "stripe" }),
  u({ id: "2", email: "apple@example.com", created_at: "2026-02-01T00:00:00Z", subscription_status: "trialing", billing_source: "apple" }),
  u({ id: "3", email: "late@example.com", created_at: "2026-04-01T00:00:00Z", subscription_status: "past_due", billing_source: "stripe" }),
  u({ id: "4", email: "free@example.com", created_at: "2026-05-01T00:00:00Z", subscription_status: "none", billing_source: null, has_profile: true }),
  u({ id: "5", email: "owner@example.com", created_at: "2026-01-15T00:00:00Z", subscription_status: "active", billing_source: null, is_owner: true }),
  u({ id: "6", email: "oldstripe@example.com", created_at: "2025-12-01T00:00:00Z", subscription_status: "canceled", billing_source: "stripe" }),
  u({ id: "7", email: "play@example.com", created_at: "2026-06-01T00:00:00Z", subscription_status: "active", billing_source: "google" }),
];

const counts = tallyRoster(roster);
assert.equal(counts.total_auth_users, 7);
assert.equal(counts.active, 3);
assert.equal(counts.trialing, 1);
assert.equal(counts.past_due, 1);
assert.equal(counts.canceled, 1);
assert.equal(counts.free, 1);
assert.equal(counts.owners, 1);
assert.equal(counts.stripe, 2, "active + past_due stripe, not the canceled row");
assert.equal(counts.apple, 1);
assert.equal(counts.google, 1);
assert.equal(counts.granted, 1, "owner active with no store");
assert.equal(counts.paid, 5);

assert.deepEqual(
  roster.filter((row) => userMatchesFilter(row, "stripe")).map((row) => row.id),
  ["1", "3"],
);
assert.deepEqual(
  roster.filter((row) => userMatchesFilter(row, "apple")).map((row) => row.id),
  ["2"],
);
assert.deepEqual(
  roster.filter((row) => userMatchesFilter(row, "free")).map((row) => row.id),
  ["4"],
);
assert.equal(userMatchesFilter(roster[4], "owners"), true);
assert.equal(userMatchesQuery(roster[0], "stripe@"), true);
assert.equal(userMatchesQuery(roster[0], "nope"), false);

const byPlan = [...roster].sort((a, b) => compareRoster(a, b, "plan"));
assert.equal(byPlan[0].subscription_status, "active");
assert.equal(byPlan.at(-1).subscription_status, "none");

const byNewest = [...roster].sort((a, b) => compareRoster(a, b, "newest"));
assert.equal(byNewest[0].email, "play@example.com");

const byBilling = [...roster].sort((a, b) => compareRoster(a, b, "billing"));
assert.equal(normalizeFirst(byBilling), "stripe");

function normalizeFirst(rows) {
  const hit = rows.find((row) => row.billing_source);
  return hit.billing_source;
}

assert.match(adminFn, /from "\.\.\/_shared\/admin-roster\.ts"/);
assert.doesNotMatch(adminFn, /admin-roster\.mjs/);
assert.match(adminFn, /billing_source:/);
assert.match(adminFn, /body\.filter/);
assert.match(adminFn, /body\.sort/);
assert.match(adminFn, /total: matched\.length/);
assert.match(core, /adminSetFilter/);
assert.match(core, /adminLoadMore/);
assert.match(core, /filter: _adminState\.filter/);
assert.match(core, /billing_source/);
assert.match(html, /id="admin-sort"/);
assert.match(html, /admin-stat\.on/);
assert.doesNotMatch(core, /limit: 40/);
