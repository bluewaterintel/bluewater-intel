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
npm ci
npm run cap:sync
cd ios/App
pod install

echo "ci_pre_xcodebuild.sh finished."
