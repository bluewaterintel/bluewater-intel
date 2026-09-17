// Owner email when a new paid/trial subscription starts (Stripe or Apple).
import { esc, ownerEmailShell, sendOwnerEmail } from "./email.ts";

export type ProfileEntitlementSnapshot = {
  subscription_status?: string | null;
  subscription_interval?: string | null;
  current_period_end?: string | null;
  trial_end?: string | null;
  billing_source?: string | null;
};

function fmtWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return new Date(iso).toUTCString(); } catch { return iso; }
}

function profileRows(p: ProfileEntitlementSnapshot): string {
  return `
    <tr><td style="padding:6px 0;color:#9ec5e8">Profile status</td><td style="padding:6px 0;font-weight:700">${esc(p.subscription_status ?? "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#9ec5e8">Billing source</td><td style="padding:6px 0">${esc(p.billing_source ?? "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#9ec5e8">Interval</td><td style="padding:6px 0">${esc(p.subscription_interval ?? "—")}</td></tr>
    <tr><td style="padding:6px 0;color:#9ec5e8">Period end</td><td style="padding:6px 0">${esc(fmtWhen(p.current_period_end))}</td></tr>
    ${p.trial_end ? `<tr><td style="padding:6px 0;color:#9ec5e8">Trial end</td><td style="padding:6px 0">${esc(fmtWhen(p.trial_end))}</td></tr>` : ""}`;
}

/** Apple / RevenueCat — INITIAL_PURCHASE (trial or paid). Best-effort; never throws. */
export async function notifyOwnerAppleSubscriber(opts: {
  email: string | null;
  userId: string;
  tierLabel: string;
  productId: string;
  profile: ProfileEntitlementSnapshot;
  rcEventType: string;
}): Promise<void> {
  try {
    const html = ownerEmailShell("🍎 New App Store subscriber", `
      <p style="margin:0 0 12px;font-size:13px;color:#9ec5e8">
        RevenueCat reported <b>${esc(opts.rcEventType)}</b>. Confirm Pro/trial unlocks in the app
        (User Admin → search this email → Sync from RevenueCat if status looks wrong).
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#e8f4ff">
        <tr><td style="padding:6px 0;color:#9ec5e8;width:130px">Email</td><td style="padding:6px 0;font-weight:700">${esc(opts.email ?? "(unknown)")}</td></tr>
        <tr><td style="padding:6px 0;color:#9ec5e8">Supabase user</td><td style="padding:6px 0;font-size:12px">${esc(opts.userId)}</td></tr>
        <tr><td style="padding:6px 0;color:#9ec5e8">Tier</td><td style="padding:6px 0;font-weight:700">${esc(opts.tierLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#9ec5e8">Product</td><td style="padding:6px 0;font-size:12px">${esc(opts.productId || "—")}</td></tr>
        ${profileRows(opts.profile)}
      </table>`);
    await sendOwnerEmail({ subject: `New App Store subscriber: ${opts.tierLabel}`, html });
  } catch (e) {
    console.error("notifyOwnerAppleSubscriber failed", (e as Error)?.message);
  }
}

/** Stripe checkout.session.completed — profile snapshot after webhook write. */
export async function notifyOwnerStripeSubscriber(opts: {
  email: string;
  userId: string | null;
  tierLabel: string;
  amount: string;
  interval: string | null;
  stripeStatus: string;
  customerId: string;
  profile: ProfileEntitlementSnapshot;
}): Promise<void> {
  try {
    const html = ownerEmailShell("🎣 New Stripe subscriber", `
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#e8f4ff">
        <tr><td style="padding:6px 0;color:#9ec5e8;width:130px">Email</td><td style="padding:6px 0;font-weight:700">${esc(opts.email)}</td></tr>
        ${opts.userId ? `<tr><td style="padding:6px 0;color:#9ec5e8">Supabase user</td><td style="padding:6px 0;font-size:12px">${esc(opts.userId)}</td></tr>` : ""}
        <tr><td style="padding:6px 0;color:#9ec5e8">Tier</td><td style="padding:6px 0;font-weight:700">${esc(opts.tierLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#9ec5e8">Price</td><td style="padding:6px 0">${esc(opts.amount)}${opts.interval ? " / " + esc(opts.interval) : ""}</td></tr>
        <tr><td style="padding:6px 0;color:#9ec5e8">Stripe status</td><td style="padding:6px 0">${esc(opts.stripeStatus)}</td></tr>
        <tr><td style="padding:6px 0;color:#9ec5e8">Customer</td><td style="padding:6px 0;font-size:12px;color:#9ec5e8">${esc(opts.customerId)}</td></tr>
        ${profileRows(opts.profile)}
      </table>`);
    await sendOwnerEmail({ subject: `New subscriber: ${opts.tierLabel}`, html });
  } catch (e) {
    console.error("notifyOwnerStripeSubscriber failed", (e as Error)?.message);
  }
}
