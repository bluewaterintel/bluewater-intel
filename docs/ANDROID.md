# Bluewater Intel — Android guide (start to finish)

This is the Android counterpart to **[IOS.md](IOS.md)**. The app is the same Capacitor
web bundle. iOS already works; Android is a second native shell around that bundle.

You do **not** need an Android phone to start. A MacBook with Android Studio’s
emulator is enough for day-to-day development. Friends’ phones come later as a
check on real GPS, keyboards, and manufacturer WebViews.

---

## What to use, and when

| Machine | Role |
|---------|------|
| **This MacBook** | Primary. Install Android Studio, run the emulator, iterate on code. Apple Silicon Macs run ARM Android images well. |
| **Friends’ phones** | Real-device QA. You send a debug APK (early) or a Play Console internal-test link (later). |
| **Windows desktop** | Optional spare. Same Android Studio + this repo. Useful if the Mac is busy, not required. |

Do **not** rewrite the app. Do not use a second JS framework. `npx cap add android`
is already done — the `android/` folder is the Gradle project.

---

## Part 1 — Install Android Studio on the Mac

1. Download **Android Studio** from [developer.android.com/studio](https://developer.android.com/studio)
2. Open the `.dmg` → drag **Android Studio** to **Applications**
3. First launch: complete the setup wizard
   - Install the **Android SDK**
   - Install a recent **SDK Platform** (API 35 is what this project targets)
   - Install the **Android SDK Build-Tools**
4. In the wizard (or **Device Manager**), create a virtual device:
   - **Phone** → **Pixel 7** or **Pixel 8** (any recent Pixel is fine)
   - System image: **ARM 64-bit** (`arm64-v8a`) on Apple Silicon — not x86
   - Download the image if prompted, then **Finish**

Android Studio ships its own JDK. You do not need a separate Java install.

Confirm in Terminal after Studio has finished SDK setup:

```bash
ls "$HOME/Library/Android/sdk"
```

If that folder exists, the SDK is installed. Android Studio usually writes
`android/local.properties` (gitignored) with `sdk.dir=...` the first time you
open the project. You can also create it yourself:

```
sdk.dir=/Users/YOURNAME/Library/Android/sdk
```

---

## Part 2 — Build and run on the emulator

From the repo root:

```bash
npm install
npm run android:icon          # first time, or after changing icons/app-icon-1024.png
npm run cap:sync:android      # rebuilds www/ and copies it into android/
npm run cap:open:android      # opens Android Studio
```

In Android Studio:

1. Wait for **Gradle Sync** to finish (bottom status bar)
2. Start the emulator from **Device Manager** (play button) if it is not already running
3. Select that emulator in the device dropdown
4. Press **▶ Run**

First Gradle sync downloads a lot; later runs are faster.

### After you change web code

```bash
npm run android:sync
```

Then **▶ Run** again in Android Studio. You do not re-add the Android platform.

If you see a blank screen: run `npm run cap:sync:android` again, then rebuild.

### Emulator GPS (map centering)

The emulator has no real GPS. In the emulator’s **…** menu → **Location**, set a
lat/lon (e.g. a Gulf or Mid-Atlantic port) and **Set Location**. Then tap
**Use my location** in the app.

---

## Part 3 — What friends can test (no Play Store yet)

You can email or AirDrop a **debug APK**. That is the fastest way to get the app
on a real phone before Google Play is set up.

### Export a debug APK from Android Studio

1. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. When it finishes, click **locate**
3. Send `app-debug.apk` to testers (Drive, AirDrop, iMessage, etc.)

On their phone:

1. Open the file
2. If Android blocks it: **Settings → Apps → Special app access → Install unknown apps** → allow the app they used to open the APK (Gmail, Files, Chrome)
3. Install → open **Bluewater Intel**

### What works on that APK

| Feature | Expected |
|---------|----------|
| Sign in / create account (same as website & iOS) | Yes |
| Map, layers, waypoints, brief | Yes |
| Location (real GPS) | Yes, after they allow the permission |
| Website Stripe Pro on the same login | Yes — entitlements are in Supabase |
| Buy Pro **inside** the Android app | **Not yet** — needs Google Play Billing (Part 5) |

Google (like Apple) requires Play Billing for digital subscriptions sold in the
app. Stripe checkout stays on the website only. Until Play products are live,
the subscribe buttons in the Android app will say billing is not configured.
That is expected and does not block map/account testing.

---

## Part 4 — Windows desktop (optional)

Same steps as the Mac: install Android Studio, clone this repo, run
`npm run cap:sync:android`, open the `android/` folder. The Gradle project is
cross-platform. Prefer the Mac while you are already developing iOS there, so
you are not keeping two copies of the repo in sync by hand.

---

## Part 5 — Play Console, RevenueCat, signed builds

Do this **after** the emulator + friend APK path feels solid.

### Package name (application ID)

Play Console asks for this when you create the app. It is already set and **must
match iOS**:

```
com.bluewaterintel.app
```

That is the same string as the Apple bundle ID. Do not invent a second ID like
`com.bluewaterintel.android`.

### 5.1 Play Console app + subscriptions

1. Pay the one-time [Google Play Console](https://play.google.com/console) fee
2. **Create app** → package name **`com.bluewaterintel.app`**
3. Complete **Account details** (legal name, address) and accept the billing /
   Play developer agreements (needed before paid subscriptions)
4. Create a **upload keystore** (keep it out of git — `*.jks` / `*.keystore` are gitignored)
5. Upload an **AAB** (Android App Bundle), not an APK, for Play
6. Use **Internal testing** to invite friends by email — they install from Play,
   which is required to test real purchases
7. **Monetize → Products → Subscriptions** — create a subscription group, then
   two base plans with the **same product IDs as iOS**:
   - `com.bluewaterintel.app.pro.monthly`
   - `com.bluewaterintel.app.pro.annual`
8. Activate the products. Play will not sell them until the app is on a testing
   track (internal is enough) and you are a **license tester**

### 5.2 RevenueCat — add Google Play to the existing project

Use the **same** RevenueCat project as iOS (`Bluewater Intel`). Do not create a
second project — entitlements must stay unified.

1. RevenueCat → **Apps → + Add → Google Play**
   - Package name: `com.bluewaterintel.app`
2. Create a Google Cloud **service account** with Play Console access (RevenueCat’s
   wizard: Play Console → Users and permissions → invite the service-account
   email with **View financial data** + **Manage orders and subscriptions**).
   Download the JSON key and paste it into RevenueCat’s Google Play app settings.
3. **Product catalog** → import/link the two Play product IDs (same strings as
   Apple). Attach **both** Play products to the existing **`pro`** entitlement.
   Put them on the **Current** offering (Monthly / Annual packages), next to the
   Apple products — one offering, two stores.
4. **Project settings → API keys** → copy the **Google** public SDK key
   (`goog_…`) into `.env`:

```
REVENUECAT_ANDROID_API_KEY=goog_your_key_here
```

   Also paste it into `ios-resources/native-client-config.json` as
   `revenueCatAndroidApiKey` if you use that file for native builds.

5. Rebuild so the key is embedded:

```
npm run cap:sync:android
```

   Then **▶ Run** in Android Studio.

6. The existing webhook (`revenuecat-webhook`) and `iap-sync` already handle
   Play events once `billing_source = 'google'` is allowed. Apply the migration
   and redeploy functions:

```
supabase db push
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy iap-sync
```

Webhook URL is unchanged from iOS (same project):

```
https://YOURPROJECT.supabase.co/functions/v1/revenuecat-webhook
```

**Entitlement name must stay exactly `pro`.** Product IDs must match `bw-iap.js`.

Play Billing **cannot** be fully tested on the emulator. Licensed testers on
**internal testing + a real device** is the path, same idea as Apple’s sandbox.

---

## Part 6 — Play Store compliance before you submit

Google’s reviewer checklist is different from Apple’s, but several items you
already have for iOS carry over.

| Item | Status / what to do |
|------|---------------------|
| **Package name** | `com.bluewaterintel.app` |
| **Target API** | Must be **36** (Android 16) for new apps as of 31 Aug 2026. Set in `android/variables.gradle`. Install SDK 36 in Android Studio if Gradle asks. |
| **16 KB page size** | Required for native libs. AGP 8.7 in this project is fine; Play Console will flag the AAB if a plugin is not aligned. |
| **Privacy policy URL** | `https://app.bluewaterintel.com/privacy.html` (same as iOS). Also paste it in Play Console → App content → Privacy policy. |
| **Support URL** | `https://app.bluewaterintel.com/support.html` |
| **Account deletion** | Already in **Menu → Account → Delete my account**. Declare it in Play Console → App content → Account deletion. |
| **Data safety form** | Declare: account email; precise/approximate location (app functionality, not shared); crash/diagnostics; in-app purchases (handled by Google). Location is **not** sold and not used for ads. |
| **Photo/video permissions** | App uses **Camera** for catch-measure. In the Photo and video permissions declaration, say camera is for measuring a catch in-app, not a gallery scrape. Do not add broad `READ_MEDIA_*` permissions. |
| **Location** | Precise location is optional (`required=false` on GPS). Disclose “used to center the map / local conditions.” |
| **Subscriptions** | Play requires in-app purchase for digital subs sold in the app (you already do this). Paywall already links Terms, Privacy, and Google Play Terms. |
| **Content rating** | Complete the IARC questionnaire in Play Console (fishing / reference — typically Everyone). |
| **Store listing** | Phone screenshots (at least 2), short + full description, icon 512×512 (export from `icons/app-icon-1024.png`), feature graphic 1024×500. |
| **Signed AAB** | Release keystore, Play App Signing enrolled. Upload to Internal testing first. |
| **License testers** | Play Console → Settings → License testing — add the Gmail accounts that will buy test subscriptions. |

Also confirm Supabase redirect URLs still include:

```
com.bluewaterintel.app://
com.bluewaterintel.app://*
```


---

## Quick reference — commands

| Task | Command |
|------|---------|
| Rebuild native web bundle | `npm run build:native` |
| Sync into the Android project | `npx cap sync android` |
| Open Android Studio | `npm run cap:open:android` |
| All-in-one | `npm run android:sync` |
| Launcher icon + splash | `npm run android:icon` |

`npm run cap:sync` stays **iOS-only** on purpose — Xcode Cloud calls it.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| “SDK location not found” | Open the project once in Android Studio, or add `android/local.properties` with `sdk.dir=...` |
| Emulator is x86 and won’t boot on Apple Silicon | Create a new AVD with an **arm64-v8a** system image |
| Blank screen | `npm run cap:sync:android`, then Run again |
| Location does nothing | Grant the permission; on emulator, set a fake location first |
| “Google Play billing is not configured yet” | Expected until Part 5. Use a website/iOS Pro login, or stay on the free tier |
| Gradle cannot find android-36 | SDK Manager → SDK Platforms → Android 16.0 (API 36) |
| Friends can’t install the APK | Unknown-sources setting (Part 3), or wait for Play internal testing |

---

## File map

```
capacitor.config.json              app ID, webDir, android.backgroundColor
android/                           Gradle project (after cap add android)
android/app/src/main/AndroidManifest.xml  location, camera, deep links
scripts/build-ios-www.mjs          stages www/ for both iOS and Android
scripts/copy-android-app-icon.mjs  launcher densities + navy splash
android-resources/                 notes to re-apply if the manifest is regenerated
www/                               built web bundle (gitignored)
```
