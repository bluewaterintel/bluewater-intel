# Privacy text fixes — device-only → account-based

Two user-facing strings in the HTML still claimed data is stored only on the
device. With required accounts + cross-device sync, that's now false. Both are
already fixed in the updated `bluewater-intel_9_4_1_4.html` in this bundle — if
you're patching your own copy in Cursor instead, here are the exact edits.

The legal/privacy policy section was reviewed and is ALREADY correct on the
substance: it already states waypoints sync to your account and are private, GPS
location is never shared, and aggregate/de-identified stats MAY be shared. No
change needed there (and legal text should go through your attorney anyway —
see the note at the bottom).

============================================================================
## EDIT 1 — Measuring tool "Offline & Privacy" card
============================================================================
Anchor: `<b>Everything runs on your device.</b>`

OLD:
```html
        <b>Everything runs on your device.</b> Photos, measurements, and your catch log never leave your phone. No internet required after the app loads. Your data is stored only in your browser.
        <br><br>
        Catch log persists across sessions. Clear browser data to delete it permanently.
```

NEW:
```html
        <b>Your data syncs to your account.</b> Your catch log, measurements, photos, and waypoints are saved to your Bluewater Intel account — sign in on any device (phone, tablet, or computer) and your data is there. Recent data is also cached on the device so the app keeps working offline once loaded.
        <br><br>
        Your data is private to your account and is never shared with other users. <b>Your GPS location is never shared.</b>
```

============================================================================
## EDIT 2 — Waypoint database info box
============================================================================
Anchor: `⭐ Your waypoint database`

OLD:
```html
      <b>⭐ Your waypoint database</b> — Everything here is yours to manage: points you add by hand, ones you save from public POIs or import from GPX, and any purchased port packs. They live on your device and never leave it unless you export them. Add, show on the map, edit, or delete any of them.
```

NEW:
```html
      <b>⭐ Your waypoint database</b> — Everything here is yours to manage: points you add by hand, ones you save from public POIs or import from GPX, and any purchased port packs. They are saved to your account and sync across your own devices, and stay private to you. Export them to GPX anytime. Add, show on the map, edit, or delete any of them.
```

============================================================================
## STILL STALE — needs your attorney, not me
============================================================================
In the Privacy Policy section there is an "Account and payment information
(future)" clause that says accounts/subscriptions are a future possibility. That
is now false — accounts are required and paid subscriptions are being added. This
needs rewriting to present tense, AND it's binding legal text, so it belongs in
the attorney review along with the subscription/auto-renewal disclosures, not in
a copy patch from me.

Items for that legal pass (all flagged across today's work):
  • Update "Account and payment information (future)" → present tense.
  • Auto-renewal + 7-day-trial disclosure wording (US state ARL laws).
  • Refund policy + easy-cancellation statement (Stripe Billing Portal is wired).
  • Confirm the aggregate-data sharing clause matches your actual practice.
  • Confirm the "GPS location never shared" guarantee matches implementation
    (it does in the code today — location is used on-device, never sent).

The diagnostics card text ("Stored on this device only…") is accurate as-is for
the local diagnostics buffer and does not need changing.
