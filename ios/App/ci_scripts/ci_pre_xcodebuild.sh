#!/bin/sh
# Fallback: ensure Pods exist right before xcodebuild (in case post-clone was skipped).
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$CI_WORKSPACE}"
PODS_XCCONFIG="$REPO_ROOT/ios/App/Pods/Target Support Files/Pods-App/Pods-App.release.xcconfig"

if [ -f "$PODS_XCCONFIG" ]; then
  echo "Pods already installed."
  exit 0
fi

echo "Pods missing — running cap sync + pod install…"
cd "$REPO_ROOT"

missing=""
[ -z "$SUPABASE_URL" ] && missing="$missing SUPABASE_URL"
[ -z "$SUPABASE_ANON_KEY" ] && missing="$missing SUPABASE_ANON_KEY"
[ -z "$REVENUECAT_IOS_API_KEY" ] && missing="$missing REVENUECAT_IOS_API_KEY"
if [ -n "$missing" ]; then
  echo "error: Missing Xcode Cloud environment variables:$missing"
  echo "Add them in Xcode Cloud → Workflow → Edit → Environment (mark as secrets)."
  exit 1
fi

npm ci
npm run cap:sync
cd ios/App
pod install

echo "ci_pre_xcodebuild.sh finished."
