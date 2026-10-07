package com.bluewaterintel.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        clearWebViewCacheIfAppUpdated();
        super.onCreate(savedInstanceState);
    }

    /** Store updates reuse https://localhost URLs; clear stale bw-config.js after versionCode bumps. */
    private void clearWebViewCacheIfAppUpdated() {
        try {
            PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
            SharedPreferences prefs = getSharedPreferences("bwi_capacitor", Context.MODE_PRIVATE);
            long prev = prefs.getLong("version_code", -1L);
            if (prev != code) {
                new WebView(getApplicationContext()).clearCache(true);
                prefs.edit().putLong("version_code", code).apply();
            }
        } catch (PackageManager.NameNotFoundException ignored) {
        }
    }
}
