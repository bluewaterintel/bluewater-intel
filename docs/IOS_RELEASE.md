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

Quit Xcode (Cmd+Q). CocoaPods ships `PaywallColor.swift` **read-only**; if you saw `EACCES` / `Permission denied`, unlock it first. Run **from the repo root** (if the prompt says `App`, `cd ../..` first):

```bash
cd /Users/ronaldnovak/Projects/bluewater-intel
chmod -R u+w ios/App/Pods/RevenueCat
chflags -R nouchg ios/App/Pods/RevenueCat
bash scripts/fix-ios-xcode27.sh
cd /Users/ronaldnovak/Projects/bluewater-intel/ios/App && pod install
cd /Users/ronaldnovak/Projects/bluewater-intel
rm -rf ~/Library/Developer/Xcode/DerivedData/App-*
open /Users/ronaldnovak/Projects/bluewater-intel/ios/App/App.xcworkspace
```

`fix-ios-xcode27.sh` **must** print `patched PaywallColor.swift for Xcode 27`. Then in Xcode: **Product → Clean Build Folder** → Run.

`pod install` / `cap sync` restore stock 5.51.1, so the Podfile `post_install` hook and the App scheme pre-action re-apply this patch automatically after you pull this fix. `@revenuecat/purchases-capacitor` 11.3.x still pulls RevenueCat **5.51.1** until Capacitor 8 + purchases-capacitor 13.x.

---

Cloud agents cannot run Xcode on your Mac; they merge fixes to `main`. You run **`mac-store-prep.sh`** locally before Archive.

See also: `native-version.json`, `npm run version:verify`, `npm run ios:pods:patch-deployment`.
