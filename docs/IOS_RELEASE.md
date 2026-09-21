# iOS App Store archive (Mac)

## One command (use this)

Quit Xcode first, then in Terminal:

```bash
cd /Users/ronaldnovak/Projects/bluewater-intel
bash scripts/mac-store-prep.sh
```

That script **stashes** local changes, **resets to `origin/main`** (fixes `Podfile.lock` pull conflicts), runs **`npm ci`**, **`npm run ios:prepare`**, and verifies Pods are on **iOS 15.0+**.

If the script is missing (old clone), run this once:

```bash
cd /Users/ronaldnovak/Projects/bluewater-intel
git stash push -u -m "pre-app-store"
git fetch origin main
git reset --hard origin/main
bash scripts/mac-store-prep.sh
```

Then in Xcode: **Any iOS Device (arm64)** → **Clean Build Folder** → **Archive**.

**Xcode 27 + RevenueCat:** If you see `PaywallColor.swift: invalid redeclaration of init(stringRepresentation:)`, your Pods were not patched. After `pod install`, run `npm run ios:revenuecat:patch` then `npm run ios:revenuecat:verify`, or re-run **`bash scripts/mac-store-prep.sh`** (it patches PaywallColor automatically). `@revenuecat/purchases-capacitor` 11.3.x still pulls RevenueCat **5.51.1**; the patch is required until you upgrade to Capacitor 8 + purchases-capacitor 13.x. Cordova `WKProcessPool` messages are warnings only.

---

Cloud agents cannot run Xcode on your Mac; they merge fixes to `main`. You run **`mac-store-prep.sh`** locally before Archive.

See also: `native-version.json`, `npm run version:verify`, `npm run ios:pods:patch-deployment`.
