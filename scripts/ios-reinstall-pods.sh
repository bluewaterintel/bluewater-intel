#!/bin/sh
# Regenerate Pods/ so Podfile post_install sets iOS 15.0 on every target (Xcode 16+).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/ios/App"
rm -rf Pods
pod install
cd "$ROOT"
node scripts/patch-pods-deployment-target.mjs
node scripts/verify-ios-pods-deployment.mjs
echo "Pods reinstalled — open ios/App/App.xcworkspace and Clean Build Folder."
