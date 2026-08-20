#!/usr/bin/env node
/** Build standalone terms.html / privacy.html / support.html for App Store Connect URLs. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "bw-reports.js"), "utf8");

function extract(name) {
  const re = new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`);
  const m = src.match(re);
  if (!m) throw new Error(`Could not extract ${name} from bw-reports.js`);
  return m[1];
}

const PAGE_SHELL = (title, body, active) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} — Bluewater Intel</title>
  <style>
    body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;background:#0a1628;color:#e8f4ff;line-height:1.65}
    .wrap{max-width:760px;margin:0 auto;padding:max(20px,env(safe-area-inset-top)) 20px 40px}
    a{color:#7dd3fc}
    nav{display:flex;flex-wrap:wrap;gap:14px;margin:0 0 22px;font-size:14px}
    nav a{text-decoration:none}
    nav a.active{font-weight:700;color:#f0f6ff}
    h1{font-size:26px;margin:0 0 8px;color:#f0f6ff}
    .sub{color:#9ec5e8;font-size:13px;margin-bottom:20px}
  </style>
</head>
<body>
  <div class="wrap">
    <nav>
      <a href="/terms.html"${active === "terms" ? ' class="active"' : ""}>Terms of Use</a>
      <a href="/privacy.html"${active === "privacy" ? ' class="active"' : ""}>Privacy Policy</a>
      <a href="/support.html"${active === "support" ? ' class="active"' : ""}>Support</a>
      <a href="/">Open app</a>
    </nav>
    <h1>${title}</h1>
    <div class="sub">Bluewater Intel LLC · Effective July 28, 2026</div>
    ${body}
    <p style="margin-top:28px;font-size:13px;color:#9ec5e8">Questions: <a href="mailto:info@bluewaterintel.com">info@bluewaterintel.com</a></p>
  </div>
</body>
</html>
`;

const appleIapNote = `
  <div style="margin:0 0 14px;padding:12px 14px;background:rgba(41,121,181,.15);border:1px solid rgba(107,191,234,.35);border-radius:10px;font-size:13px">
    <b>iOS App Store subscriptions.</b> If you subscribe in the iPhone or iPad app, payment is processed by Apple.
    Manage or cancel in <b>Settings → [your name] → Subscriptions</b>. Apple&apos;s
    <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener">Licensed Application End User License Agreement</a>
    also applies to App Store purchases.
  </div>
`;

writeFileSync(
  join(root, "terms.html"),
  PAGE_SHELL("Terms of Use", appleIapNote + extract("LEGAL_TERMS_HTML"), "terms"),
);
writeFileSync(
  join(root, "privacy.html"),
  PAGE_SHELL("Privacy Policy", extract("LEGAL_PRIVACY_HTML"), "privacy"),
);
writeFileSync(
  join(root, "support.html"),
  PAGE_SHELL(
    "Support",
    `<p style="margin:0 0 12px">Bluewater Intel is a fishing planning app for coastal anglers from Maine to Southern California.</p>
     <p style="margin:0 0 12px"><b>Email:</b> <a href="mailto:info@bluewaterintel.com">info@bluewaterintel.com</a></p>
     <p style="margin:0 0 12px">For billing on the website, sign in at <a href="https://app.bluewaterintel.com">app.bluewaterintel.com</a> and use <b>Menu → Account → Manage billing</b>.</p>
     <p style="margin:0">For iOS subscriptions, manage in <b>Settings → [your name] → Subscriptions</b> on your device.</p>`,
    "support",
  ),
);
console.log("Generated terms.html, privacy.html, support.html");
