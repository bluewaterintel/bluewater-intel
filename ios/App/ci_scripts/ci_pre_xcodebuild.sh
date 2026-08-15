#!/bin/sh
# Fallback: ensure Pods exist right before xcodebuild.
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$CI_WORKSPACE}"
PODS_XCCONFIG="$REPO_ROOT/ios/App/Pods/Target Support Files/Pods-App/Pods-App.release.xcconfig"

if [ -f "$PODS_XCCONFIG" ]; then
  echo "Pods already installed."
  exit 0
fi

echo "Pods missing — running cap sync + pod install..."
cd "$REPO_ROOT"

export HOMEBREW_NO_AUTO_UPDATE=1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  brew install node
fi

npm ci
npm run cap:sync
cd ios/App
if ! command -v pod >/dev/null 2>&1; then
  brew install cocoapods
fi
pod install

echo "ci_pre_xcodebuild.sh finished."
