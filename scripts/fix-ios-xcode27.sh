#!/usr/bin/env bash
# Patch RevenueCat PaywallColor in the existing Pods tree. Does not git reset.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
node scripts/patch-revenuecat-paywall-color.mjs
if command -v ruby >/dev/null 2>&1; then
  ruby ios/App/patch_revenuecat_paywall_color.rb
fi
npm run ios:revenuecat:verify
echo ""
echo "OK. In Xcode: Product → Clean Build Folder, then Run."
echo "If it still fails, quit Xcode and re-run this script (pod install restores unpatched 5.51.1)."
