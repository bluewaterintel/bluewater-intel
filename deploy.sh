#!/usr/bin/env bash
# ============================================================================
# Bluewater Intel — deploy Milestones 1 + 2
# Runs migrations (0001 waypoints/ramps, 0002 auth/user-data) and seeds the
# reference data. Run from your repo root, with the Supabase CLI installed and
# the project already linked (supabase link --project-ref <ref>).
#
# Usage:
#   export SUPABASE_URL=https://YOURPROJECT.supabase.co
#   export SUPABASE_SERVICE_ROLE_KEY=eyJ...        # server-side ONLY, never commit
#   ./deploy.sh
#
# Safe to re-run: migrations are idempotent; the seed truncates + reloads.
# ============================================================================
set -euo pipefail

# ── Preconditions ───────────────────────────────────────────────────────────
command -v supabase >/dev/null || { echo "ERROR: supabase CLI not found. npm i -g supabase"; exit 1; }
command -v node >/dev/null     || { echo "ERROR: node not found."; exit 1; }
: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"

MIG_DIR="supabase/migrations"
SEED="supabase-m1/seed/load.mjs"

echo "==> Checking migration files are in place ($MIG_DIR)"
for f in 0001_waypoints_ramps.sql 0002_auth_user_data.sql; do
  if [ ! -f "$MIG_DIR/$f" ]; then
    echo "ERROR: missing $MIG_DIR/$f"
    echo "Copy the two migration files into $MIG_DIR first:"
    echo "  mkdir -p $MIG_DIR"
    echo "  cp supabase-m1/migrations/0001_waypoints_ramps.sql $MIG_DIR/"
    echo "  cp supabase-m2/migrations/0002_auth_user_data.sql  $MIG_DIR/"
    exit 1
  fi
done

# ── Step 1: migrations ──────────────────────────────────────────────────────
echo "==> Step 1/3: applying migrations (supabase db push)"
supabase db push

# ── Step 2: seed reference data (Milestone 1) ───────────────────────────────
echo "==> Step 2/3: installing supabase-js (for the seed loader)"
npm install @supabase/supabase-js >/dev/null 2>&1 || npm install @supabase/supabase-js

echo "==> Step 2/3: seeding waypoints + ramps"
if [ ! -f "$SEED" ]; then echo "ERROR: missing $SEED"; exit 1; fi
SUPABASE_URL="$SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" node "$SEED"

# ── Step 3: reminders the script can't do for you ───────────────────────────
echo "==> Step 3/3: manual steps remaining (dashboard):"
echo "    • Authentication → Providers → enable Email (decide on email confirmation)"
echo "    • Set URL + anon key in client: bw-data-source.js (BW_DATA_CONFIG)"
echo "                                    bw-auth.js        (BW_SUPABASE_CONFIG)"
echo "    • Apply both client/CLIENT_PATCH.md files to the app HTML"
echo "      (M2 Step 6 = required privacy-text rewrite)"
echo "    • Re-run the integrity check on the HTML before shipping"
echo ""
echo "Done. Smoke test: load waypoints near a port; sign up + add data + sign in"
echo "on a second browser (sync); sign in as a 2nd user (should see none of the 1st's data)."
