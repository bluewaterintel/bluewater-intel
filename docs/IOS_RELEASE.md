# iOS App Store archive (Mac)

Cloud agents and merges update **`native-version.json`** and the iOS/Android project files. Your Mac only needs pull + one npm script before Archive.

## Every release on your Mac

```bash
cd bluewater-intel
git fetch origin
git pull origin main
npm ci
npm run ios:prepare
open ios/App/App.xcworkspace
```

In Xcode: **Product → Clean Build Folder**, then **Archive**.

`npm run ios:prepare`:

1. Writes `native-version.json` into `project.pbxproj` and `build.gradle`
2. Copies the app icon and builds `www/`
3. Runs `cap sync ios`
4. On macOS: runs **`agvtool`** so the General tab matches the repo
5. Runs **`xcodebuild -showBuildSettings`** and fails if Version/Build still disagree

## Bump build for App Store Connect

When you need a new build number (must be higher than the last upload):

```bash
npm run version:native -- 1.5.2 73
git add native-version.json android ios
git commit -m "Bump native release to 1.5.2 (73)"
git push
```

Then on the Mac: `git pull && npm ci && npm run ios:prepare` before Archive.

## If Xcode still shows the wrong version

- Open **`ios/App/App.xcworkspace`**, not `App.xcodeproj` and not an old clone path.
- Run `npm run version:verify` — must print `OK: …`
- Run `npm run ios:prepare` again on the **Mac** (agvtool only runs on macOS).
- **Product → Clean Build Folder**, quit and reopen Xcode if the General tab was cached.

## What we cannot do from Cloud Agent

Archive and upload require your Apple ID on a Mac. The agent can merge version bumps and `ios:prepare` logic; you run **`npm run ios:prepare`** locally so Xcode is verified before Archive.
