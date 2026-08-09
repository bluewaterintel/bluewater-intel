# iOS app icon (home screen tile)

Xcode hides this — the fastest path:

1. Save your logo as **`icons/app-icon-1024.png`**
   - Exactly **1024 × 1024** pixels
   - **PNG**, no transparency
   - Square marlin/symbol on navy `#0a1628` (not the wide wordmark)

2. Run from the repo root:

   ```bash
   npm run ios:icon
   npm run cap:sync
   ```

3. In Xcode: **Product → Clean Build Folder** (`Cmd+Shift+K`), then **Run**.

The file is copied to:
`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`

## Optional: set in Xcode

Open **`ios/App/App.xcworkspace`** → left sidebar **App** (yellow folder) → **Assets.xcassets** → **AppIcon** → drag PNG onto the **1024×1024** slot labeled *App Store iOS*.
