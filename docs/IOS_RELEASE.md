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

**Xcode 27 + RevenueCat:** The error `PaywallColor.swift:57 invalid redeclaration of init(stringRepresentation:)` means CocoaPods still has **unpatched** RevenueCat 5.51.1. `WKProcessPool` lines are warnings only.

Quit Xcode, then patch the copy already in `ios/App/Pods` (this is the command that actually fixes the compiler error):

```bash
cd /Users/ronaldnovak/Projects/bluewater-intel
git fetch origin main
git reset --hard origin/main
node scripts/patch-revenuecat-paywall-color.mjs
# must print: patched PaywallColor.swift for Xcode 27
# NOT: already Xcode-27-safe  (that message on a failing build means the file was not patched)
```

Then in Xcode: **Product → Clean Build Folder** → Run.

`pod install` / `cap sync` restore stock 5.51.1, so the Podfile `post_install` hook and the App scheme pre-action re-apply this patch automatically after you pull this fix. `@revenuecat/purchases-capacitor` 11.3.x still pulls RevenueCat **5.51.1** until Capacitor 8 + purchases-capacitor 13.x.

---

Cloud agents cannot run Xcode on your Mac; they merge fixes to `main`. You run **`mac-store-prep.sh`** locally before Archive.

See also: `native-version.json`, `npm run version:verify`, `npm run ios:pods:patch-deployment`.
