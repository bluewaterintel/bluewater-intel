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

if ! command -v pod >/dev/null 2>&1; then
  echo "Installing CocoaPods..."
  brew install cocoapods
fi

echo "ios:prepare (www, cap sync, pod install, iOS 15 pod patch)..."
npm run ios:prepare

echo "ci_post_clone.sh finished."
