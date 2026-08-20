# App Store rejection fixes (Aug 2026)

Apple rejected **1.0 (22)** with four issues. This doc maps each to code changes and App Store Connect steps.

## 1. Placeholder app icons (Guideline 2.3.8)

**Code:** Final icon lives at `icons/app-icon-1024.png` (1024×1024, no transparency). Run before every archive:

```bash
npm run ios:icon
npm run cap:sync
```

In Xcode: **Product → Clean Build Folder**, then archive. Confirm **Assets.xcassets → AppIcon** shows the marlin/teal icon, not the default Capacitor placeholder.

**Also:** `icons/icon-512.png` / `icon-192.png` were old 11 KB placeholders used by the web manifest — regenerate from `app-icon-1024.png` if needed.

---

## 2. Subscription disclosure (Guideline 3.1.2c)

**Code (done):** Native pricing screens now show:

- Subscription title: **Bluewater Intel Pro**
- Length: **1 month** / **1 year**
- Price: loaded from App Store when available
- **Terms of Use**, **Privacy Policy**, **Apple EULA** links
- Auto-renewal disclosure + **Restore Purchases**

**Hosted URLs** (required in App Store Connect metadata):

| Field | URL |
|-------|-----|
| Privacy Policy | `https://app.bluewaterintel.com/privacy.html` |
| Support URL | `https://app.bluewaterintel.com/support.html` |
| EULA | Use Apple Standard EULA **or** `https://app.bluewaterintel.com/terms.html` |

Generate pages locally: `npm run legal:pages` (also runs on `npm run deploy` and `npm run build:ios`).

In **App Store Connect → App Information**:

- Privacy Policy URL → paste privacy link above
- Support URL → paste support link above

In **App Description** (if using Apple Standard EULA), add:

> Terms of Use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/

---

## 3. IAP error when tapping subscription (Guideline 2.1b)

Most often caused by **IAP products not submitted/approved** (see #4) or **Paid Apps Agreement** not active.

**App Store Connect checklist:**

1. **Agreements, Tax, and Banking** → **Paid Apps Agreement** = Active
2. **In-App Purchases** → both products exist and are **Ready to Submit** or **Approved**:
   - `com.bluewaterintel.app.pro.monthly`
   - `com.bluewaterintel.app.pro.annual`
3. **RevenueCat** → Products linked → Offering marked **Current** → `pro` entitlement attached
4. Test on a **physical device** with a **Sandbox** Apple ID (not Simulator)

**Xcode:** App target → **Signing & Capabilities** → **In-App Purchase** capability enabled.

---

## 4. IAP products not submitted for review (Guideline 2.1b)

Apple will **not** approve the app until IAP products are submitted **with** a new binary.

**Steps:**

1. App Store Connect → your app → **Subscriptions** (or In-App Purchases)
2. Open **each** subscription product
3. Fill required metadata (display name, description, price tier)
4. Add **App Review screenshot** showing the subscription/paywall in the app
5. Set status to **Submit for Review** (with the app version)
6. Upload **new build** (build number must exceed last upload — check Xcode Cloud vs local)
7. On the version page, attach the new build **and** ensure IAP products are included in the submission

---

## Resubmission workflow

```bash
# 1. Ensure build number > latest in App Store Connect (e.g. 23 if 22 was last)
# Edit CURRENT_PROJECT_VERSION in ios/App/App.xcodeproj/project.pbxproj

npm run ios:icon
npm run build:ios && npx cap copy ios
# Archive in Xcode → Distribute → App Store Connect

npm run legal:pages   # if deploying web URLs
npm run deploy        # publish privacy/terms/support pages
```

Then in App Store Connect: attach new build, submit IAP products, resubmit for review.
