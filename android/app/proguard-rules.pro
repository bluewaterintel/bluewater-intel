# App-specific R8 rules (Capacitor consumer rules ship with @capacitor/android).

# Readable crash stacks in Play / Firebase when mapping.txt is uploaded.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Launcher entry (subclass of BridgeActivity).
-keep class com.bluewaterintel.app.MainActivity { *; }

# Google Play Billing + RevenueCat (reflection / JNI in SDK).
-keep class com.android.vending.billing.** { *; }
-keep class com.revenuecat.purchases.** { *; }

# Kotlin metadata used by plugin / SDK boundaries.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
