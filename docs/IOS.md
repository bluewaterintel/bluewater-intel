# Bluewater Intel — iOS App Store Guide (start to finish)

This guide assumes you have **never built an iOS app before** but already have an **Apple Developer account**.

---

## Part 0 — Two different names (this is NOT backwards)

You asked about `app.bluewaterintel.com` vs `com.bluewaterintel.app`. **Both are correct** — they serve completely different jobs:

| Name | Type | What it is |
|------|------|------------|
| **`app.bluewaterintel.com`** | Website URL | Your live web app in Safari. Users visit `https://app.bluewaterintel.com`. Stripe checkout runs here. |
| **`com.bluewaterintel.app`** | Apple bundle ID | Apple's **reverse-DNS identifier** for your iOS app (like a social security number for the app). It is **not** a website and is **not** meant to be typed in a browser. |

Apple **requires** bundle IDs to look like `com.company.product` — domain-style names backwards. That is industry standard for every iOS app.

**Custom URL scheme (also `com.bluewaterintel.app://`)**  
When a user taps “confirm email” on their phone, Supabase opens `com.bluewaterintel.app://?confirmed=1` so iOS launches **your app** instead of Safari. This is separate from the website URL.

```
Website:     https://app.bluewaterintel.com
iOS app ID:  com.bluewaterintel.app
Deep link:   com.bluewaterintel.app://?confirmed=1
```

---

## Part 1 — How accounts & billing work (your requirements)

### One account everywhere

All users share a **single Supabase account** (email + password):

| Signed up on… | Logs in on… | Works? |
|---------------|-------------|--------|
| Website | iOS app | ✅ Same email/password |
| iOS app | Website | ✅ Same email/password |
| Website (Stripe Pro) | iOS app | ✅ Pro features unlock (no second purchase) |
| iOS app (Apple Pro) | Website | ✅ Pro features unlock (no second purchase) |

There is **one** `profiles` row per user. Both payment systems write to the same `subscription_status` field.

### Two payment paths (never mixed in-app)

| Platform | Payment | Manage subscription |
|----------|---------|---------------------|
| **Website** (`app.bluewaterintel.com`) | **Stripe** | Stripe billing portal |
| **iOS App Store app** | **Apple In-App Purchase** | iPhone Settings → Subscriptions |

**Stripe never appears in the iOS app** — Apple requires App Store billing for digital subscriptions sold inside the app. If someone subscribed on the website, the iOS app shows Pro but tells them to manage billing on the website.

---

## Part 2 — Install tools on your Mac

### 2.1 Xcode

1. Open the **Mac App Store**
2. Search **Xcode** → **Get** (large download, ~12 GB)
3. When done, open Xcode once and accept the license
4. Open **Terminal** and run:
   ```bash
   xcode-select --install
   ```
   (Install command-line tools if prompted.)

### 2.2 Node.js

1. Go to [https://nodejs.org](https://nodejs.org) → download **LTS** (22.x)
2. Install the `.pkg`
3. Verify in Terminal:
   ```bash
   node --version    # should show v22.x
   npm --version
   ```

### 2.3 Project dependencies

```bash
cd /path/to/bluewater-intel
npm install
```

---

## Part 3 — Build the iOS app locally

Run these commands **in order**:

```bash
# 1. Generate web config (Supabase keys from your .env)
npm run config

# 2. Copy web files into www/ for the native bundle (offline mode ON)
npm run build:ios

# 3. Create the Xcode project (ONLY THE FIRST TIME)
npx cap add ios

# 4. Copy www/ + plugins into the Xcode project
npx cap sync ios

# 5. Open Xcode
npm run cap:open:ios
```

### 3.1 First run in Xcode

1. In the left sidebar, click the blue **App** icon (top item)
2. Select the **App** target → **Signing & Capabilities**
3. **Team**: choose your Apple Developer team
4. **Bundle Identifier**: must be `com.bluewaterintel.app`
5. Plug in your iPhone **or** choose an **iPhone simulator** from the device dropdown (top toolbar)
6. Press **▶ Run** (or `Cmd+R`)

If you see a blank screen: run `npm run build:ios && npx cap sync ios` again, then rebuild.

### 3.2 After you change web code

```bash
npm run ios:sync
```

This rebuilds `www/`, syncs to Xcode, and reopens the project.

---

## Part 4 — Configure Supabase (auth works on iOS + web)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. **Authentication** → **URL Configuration**
3. **Site URL**: `https://app.bluewaterintel.com`
4. **Redirect URLs** — add **all** of these (one per line):

```
https://app.bluewaterintel.com/**
com.bluewaterintel.app://
com.bluewaterintel.app://*
http://localhost/**
```

5. Run the new database migration (adds Apple billing columns):

```bash
supabase db push
# or apply supabase/migrations/0015_apple_iap_billing.sql manually in SQL editor
```

---

## Part 5 — App Store Connect (create the app record)

1. Go to [App Store Connect](https://appstoreconnect.apple.com)
2. **My Apps** → **+** → **New App**
3. Fill in:
   - **Platform**: iOS
   - **Name**: Bluewater Intel
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: select `com.bluewaterintel.app` (create it in step 5.1 if missing)
   - **SKU**: `bluewater-intel-ios` (any unique string)
   - **User Access**: Full Access

### 5.1 Register the bundle ID (if needed)

1. [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list)
2. **+** → **App IDs** → **App**
3. Description: `Bluewater Intel`
4. Bundle ID: **Explicit** → `com.bluewaterintel.app`
5. Enable **In-App Purchase**
6. **Register**

### 5.2 Create subscriptions (Apple IAP products)

In App Store Connect → your app → **Subscriptions**:

1. Create a **Subscription Group** named `Pro`
2. Add two subscriptions:

| Reference name | Product ID | Price |
|----------------|------------|-------|
| Pro Monthly | `com.bluewaterintel.app.pro.monthly` | $12.99/month |
| Pro Annual | `com.bluewaterintel.app.pro.annual` | $109.99/year |

3. For each subscription:
   - Add localization (display name + description)
   - Optional: configure **7-day free trial** under **Subscription Prices → Introductory Offers**
4. Submit subscriptions for review (they ship with your app review)

**Important:** Product IDs must match exactly what's in `bw-iap.js`.

---

## Part 6 — RevenueCat (connects Apple ↔ Supabase)

We use [RevenueCat](https://www.revenuecat.com) (free tier available) because it handles StoreKit, receipt validation, and webhooks — much simpler than writing that yourself.

### 6.1 Create RevenueCat project

1. Sign up at [revenuecat.com](https://www.revenuecat.com)
2. **Create new project** → name: `Bluewater Intel`
3. **Apps** → **Add app** → **Apple App Store**
   - Bundle ID: `com.bluewaterintel.app`
   - Connect App Store Connect (follow their wizard — you'll need an **App Store Connect API key**)

### 6.2 Add products, entitlement & offering

1. **Product catalog** → import/link your two App Store subscription product IDs:
   - `com.bluewaterintel.app.pro.monthly`
   - `com.bluewaterintel.app.pro.annual`
2. **Entitlements** → create entitlement named **`pro`**
3. Attach **both** App Store subscriptions to the **`pro`** entitlement
4. **Offerings** → open **default** (or create one) → set as **Current**
5. Add two packages to that offering:
   - **Monthly** → `com.bluewaterintel.app.pro.monthly`
   - **Annual** → `com.bluewaterintel.app.pro.annual`

If the **Current** offering is empty, the app falls back to direct StoreKit purchase — but entitlements/webhooks still require step 3 above.

### 6.3 API keys

1. **Project settings → API keys**
2. Copy the **Apple/public** SDK key (starts with `appl_`)
3. Add to your `.env`:

```
REVENUECAT_IOS_API_KEY=appl_your_key_here
```

4. Rebuild iOS bundle so the key is embedded:

```bash
npm run build:ios && npx cap sync ios
```

### 6.4 Webhook + post-purchase sync → Supabase

1. Set secrets and deploy both functions:

```bash
supabase secrets set REVENUECAT_WEBHOOK_AUTH=your-long-random-secret
supabase secrets set REVENUECAT_SECRET_API_KEY=sk_your_revenuecat_secret_key
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy iap-sync
```

Webhook URL:
```
https://YOURPROJECT.supabase.co/functions/v1/revenuecat-webhook
```

2. In RevenueCat → **Integrations → Webhooks → Add**
   - URL: the URL above
   - Authorization header: `Bearer your-long-random-secret` (same as `REVENUECAT_WEBHOOK_AUTH`)
   - Events: send all subscription events

When a user buys Pro on iOS, RevenueCat notifies Supabase via the webhook. The app also calls **`iap-sync`** immediately after purchase/restore so Pro unlocks even if the webhook is delayed.

**Entitlement name must be exactly `pro`** in RevenueCat, with both App Store products attached.

### 6.5 Enable In-App Purchase in Xcode

1. Open project in Xcode (`npm run cap:open:ios`)
2. **App** target → **Signing & Capabilities** → **+ Capability**
3. Add **In-App Purchase**

Also merge keys from `ios-resources/Info.plist.additions.xml` into `ios/App/App/Info.plist` (URL scheme + camera/location permission strings).

---

## Part 7 — Test on a real iPhone (before App Store)

Apple **does not** allow testing real IAP in the simulator. Use a **physical device**.

### 7.1 Sandbox tester

1. App Store Connect → **Users and Access** → **Sandbox** → **Testers**
2. **+** → create a fake tester email (e.g. `you+ios-test@yourdomain.com`)
3. On your iPhone: **Settings → App Store → Sandbox Account** → sign in with that tester

### 7.2 Install via Xcode

1. Connect iPhone via USB
2. Select your iPhone in Xcode's device dropdown
3. **Run** ▶
4. If prompted on phone: **Trust** the developer certificate (Settings → General → VPN & Device Management)

### 7.3 Test checklist

- [ ] Create account with email/password in the app
- [ ] Log out → log in on **website** with same credentials
- [ ] Purchase Pro monthly (sandbox — no real charge)
- [ ] Pro features unlock in app
- [ ] Log in on **website** → Pro features unlock there too
- [ ] **Restore purchases** link works after reinstall
- [ ] Website Stripe subscriber can log into app and see Pro (no Apple purchase prompt)

---

## Part 8 — TestFlight (beta testing)

### 8.1 Upload from Xcode (local)

1. In Xcode: set **Version** (e.g. `1.0.0`) and **Build** (e.g. `1`) under **General**
2. **Product → Archive** (select **Any iOS Device** first, not simulator)
3. When Organizer opens → **Distribute App** → **App Store Connect** → **Upload**
4. In App Store Connect → **TestFlight** tab → wait for processing (~15–30 min)
5. **Internal Testing** → add yourself → install **TestFlight** app on iPhone → install build

### 8.2 Xcode Cloud (CI builds)

The repo includes `ios/App/ci_scripts/ci_post_clone.sh`, which runs `npm ci`, `npm run cap:sync`, and `pod install` before archive. **Pods/** is gitignored (correct), so Xcode Cloud must generate it — without this script you get:

> Unable to open base configuration reference file `Pods-App.release.xcconfig`

**Workflow settings:**

1. Open **`App.xcworkspace`** (not `App.xcodeproj`) when creating the workflow
2. **Environment variables are optional** — public iOS client keys live in `ios-resources/native-client-config.json` and are used when Xcode Cloud has no secrets configured
3. After pushing CI scripts, **start a new build** on latest `main` (do not **Re-run** an old failed build — that repeats the pre-fix commit)

**Re-run vs new build:** **Re-run** / **Rebuild** repeats the **same commit** as the failed build. Use **Start Build** on latest `main`. In Xcode: Report navigator → Cloud → Control-click the workflow → **Start Build**. Confirm the build log shows `Installing npm dependencies…` during post-clone.

---

## Part 9 — App Store submission

### 9.1 Required assets

- **App icon**: 1024×1024 PNG (no transparency). Start from `icons/icon-512.png` and upscale.
- **Screenshots**: at least 6.7" and 6.1" iPhone sizes (capture from simulator: `Cmd+S`)
- **Description**, **keywords**, **support URL**, **privacy policy URL**

### 9.2 App privacy

In App Store Connect → **App Privacy**, declare:

- **Location** (approximate) — map centering
- **Email** — account
- **User content** — catches, waypoints (if applicable)

### 9.3 Review notes

Tell Apple:

> Bluewater Intel is a fishing intelligence app. Subscriptions are sold via In-App Purchase. Users who subscribed on our website (app.bluewaterintel.com) can log in with the same credentials; no duplicate purchase is required.

### 9.4 Submit

1. App Store Connect → **App Store** tab → **+ Version**
2. Select the TestFlight build
3. Answer export compliance (typically **No** for HTTPS-only apps)
4. **Submit for Review**

Review usually takes 1–3 days.

---

## Part 10 — Deploy updated Stripe webhook (website billing)

After pulling these changes, redeploy so website subscriptions tag `billing_source = 'stripe'`:

```bash
supabase functions deploy stripe-webhook
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
```

---

## Quick reference — commands

| Task | Command |
|------|---------|
| Rebuild iOS bundle | `npm run build:ios` |
| Sync to Xcode | `npx cap sync ios` |
| Open Xcode | `npm run cap:open:ios` |
| All-in-one | `npm run ios:sync` |
| Deploy Apple webhook | `supabase functions deploy revenuecat-webhook --no-verify-jwt` |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| “StoreKit plugin not loaded” | `npm install && npx cap sync ios`, rebuild in Xcode |
| “In-app purchases not configured” | Set `REVENUECAT_IOS_API_KEY` in `.env`, run `npm run build:ios` |
| Email link opens Safari, not app | Check Supabase redirect URLs + `Info.plist` URL scheme |
| Pro not showing after purchase | Check RevenueCat webhook logs + Supabase function logs |
| Website subscriber can't manage in app | Expected — app shows message to use website (Apple rules) |

---

## File map

```
capacitor.config.json        Capacitor app ID, webDir, iOS/Android plugins
bw-capacitor.js                  Deep links, status bar
bw-iap.js                        Native IAP (RevenueCat / StoreKit / Play Billing)
bw-billing.js                    Stripe (web) vs IAP (native) routing
scripts/build-ios-www.mjs        Stages www/ for Capacitor
docs/ANDROID.md                  Android Studio, emulator, friend APK testing
supabase/migrations/0015_*.sql   billing_source + Apple transaction ID
supabase/functions/revenuecat-webhook/  IAP → profiles sync
ios/                             Xcode project (after cap add ios)
android/                         Gradle project (after cap add android)
www/                             Built web bundle (gitignored)
```
