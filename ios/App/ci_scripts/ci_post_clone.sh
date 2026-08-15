#!/bin/sh
# Xcode Cloud: install JS + CocoaPods deps before archive.
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$CI_WORKSPACE}"
cd "$REPO_ROOT"

export HOMEBREW_NO_AUTO_UPDATE=1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js via Homebrew..."
  brew install node
fi

echo "Using node: $(command -v node)"
node -v
npm -v

echo "Installing npm dependencies..."
npm ci

echo "Building www/ and syncing Capacitor iOS project..."
npm run cap:sync

echo "Installing CocoaPods..."
cd ios/App
if ! command -v pod >/dev/null 2>&1; then
  brew install cocoapods
fi
pod install

echo "ci_post_clone.sh finished."
