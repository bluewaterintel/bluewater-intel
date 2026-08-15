#!/bin/sh
# Xcode Cloud: install JS + CocoaPods deps before archive.
# Pods/ is gitignored; without this script the build fails looking for Pods-App.release.xcconfig.
set -e

REPO_ROOT="${CI_PRIMARY_REPOSITORY_PATH:-$CI_WORKSPACE}"
cd "$REPO_ROOT"

echo "Installing npm dependencies…"
npm ci

echo "Building www/ and syncing Capacitor iOS project…"
npm run cap:sync

echo "Installing CocoaPods…"
cd ios/App
pod install

echo "ci_post_clone.sh finished."
