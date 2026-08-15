#!/bin/sh
# Xcode Cloud: install JS + CocoaPods deps before archive.
# Pods/ is gitignored; without this script the build fails looking for Pods-App.release.xcconfig.
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$CI_WORKSPACE}"
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

echo "Installing npm dependencies…"
npm ci

echo "Building www/ and syncing Capacitor iOS project…"
npm run cap:sync

echo "Installing CocoaPods…"
cd ios/App
pod install

echo "ci_post_clone.sh finished."
