#!/usr/bin/env bash
# One-time setup: GitHub login → push secrets from .env → optional test run.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "Installing GitHub CLI…"
  brew install gh
fi

if ! gh auth status >/dev/null 2>&1; then
  echo ""
  echo "Sign in to GitHub (browser will open). Choose:"
  echo "  • GitHub.com"
  echo "  • HTTPS"
  echo "  • Login with a web browser"
  echo ""
  gh auth login -h github.com -p https -w
fi

echo ""
node scripts/setup-github-waypoint-secrets.mjs

echo ""
if git rev-parse --verify origin/main >/dev/null 2>&1; then
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse origin/main)
  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "Your local main is ahead of origin. Push so the workflow file is on GitHub:"
    echo "  git push origin main"
    echo ""
  fi
fi

if gh workflow list 2>/dev/null | grep -q "Snapshot waypoints"; then
  echo "Starting a test snapshot run…"
  gh workflow run pull-waypoints.yml
  echo "Watch progress: gh run list --workflow=pull-waypoints.yml"
else
  echo "After you push, test manually:"
  echo "  GitHub → Actions → Snapshot waypoints → Run workflow"
fi
