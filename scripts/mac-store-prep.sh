#!/usr/bin/env bash
# One-shot Mac App Store prep: discard blocking local ios/Pods drift, sync main, build + patch pods.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "=== Bluewater Intel: Mac App Store prep ==="
echo "Repo: $REPO_ROOT"
echo ""

if ! command -v git >/dev/null 2>&1; then
  echo "error: git not found"
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found — install Node.js (https://nodejs.org or brew install node)"
  exit 1
fi

echo "==> Stashing local changes (Podfile.lock, etc.)..."
git stash push -u -m "mac-store-prep $(date -u +%Y%m%dT%H%M%SZ)" || true

echo "==> Hard sync to origin/main (avoids pull/merge conflicts)..."
git fetch origin main
git checkout main 2>/dev/null || git checkout -B main
git reset --hard origin/main

echo "==> npm ci..."
npm ci

if ! command -v pod >/dev/null 2>&1; then
  echo ""
  echo "error: CocoaPods not found. Install with: brew install cocoapods"
  echo "Then re-run: bash scripts/mac-store-prep.sh"
  exit 1
fi

echo "==> ios:prepare (www, cap sync, pod install, iOS 15 pod patch, version check)..."
npm run ios:prepare

echo "==> pod update RevenueCat PurchasesHybridCommon (Xcode 27 / PaywallColor fix)..."
cd ios/App
pod update RevenueCat PurchasesHybridCommon RevenuecatPurchasesCapacitor 2>/dev/null || pod install
cd "$REPO_ROOT"
node scripts/patch-pods-deployment-target.mjs

echo "==> Final pod deployment check..."
npm run ios:pods:verify-deployment

echo ""
echo "=== SUCCESS ==="
echo "1. Quit Xcode if it is open (Cmd+Q)."
echo "2. open \"$REPO_ROOT/ios/App/App.xcworkspace\""
echo "3. Select: Any iOS Device (arm64)"
echo "4. Product → Clean Build Folder"
echo "5. Product → Archive"
echo ""
