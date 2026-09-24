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

If the **web** app shows new data (species, maps, copy) but the **simulator** does not, the bundled `ios/App/App/public/` copy is stale or WKWebView cached old script URLs. After `ios:prepare`, confirm:

```bash
grep "California Halibut" ios/App/App/public/bw-data-species.js
grep "California Halibut" ios/App/App/public/bw-data-encyclopedia.js
```

Both should match. Then **delete the app** from the simulator, **Product → Clean Build Folder**, and Run again.

**Verify bundle (must pass before Run in Xcode):**

```bash
npm run build:ios && npx cap copy ios && npm run verify:iosbundle
```

In the Xcode **Report navigator**, open the latest build → expand **Sync Capacitor Web Assets**. If you see `error: npm not in PATH`, Xcode skipped the copy and the simulator is still on old JavaScript. Fix: run the three commands above in Terminal, then build again — or quit Xcode and run `open ios/App/App.xcworkspace` from that same Terminal window.

**UI checks:** Species dropdown is port-filtered — pick **San Diego, CA** (not Stuart or Venice). Encyclopedia: tap **All** (not only Offshore). Search **halibut**. In Safari Web Inspector (simulator), `window.BW_DATA_CONFIG.webBundle` should show `halibut: true` and `cacheTag: "20260924b"`.

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
