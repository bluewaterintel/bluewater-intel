// Shared account deletion helpers for delete-account + admin edge functions.
import Stripe from "npm:stripe@16";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const ACTIVE_SUB_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);

export function isMissingStripeCustomer(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return /no such customer/i.test(msg);
}

export async function cancelStripeSubscriptions(stripe: Stripe, customerId: string): Promise<void> {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  const active = subs.data.filter((s) => ACTIVE_SUB_STATUSES.has(s.status));
  for (const sub of active) {
    await stripe.subscriptions.cancel(sub.id);
  }
}

export async function deleteUserData(admin: SupabaseClient, userId: string): Promise<void> {
  // Intentionally omits trial_consumed — survives deletion to block repeat trials.
  const tables = [
    { table: "user_waypoints", column: "user_id" },
    { table: "user_catches", column: "user_id" },
    { table: "user_logs", column: "user_id" },
    { table: "fishing_reports", column: "user_id" },
    { table: "user_brief_usage", column: "user_id" },
    { table: "profiles", column: "id" },
  ] as const;

  for (const { table, column } of tables) {
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error) throw new Error(`Failed to delete ${table}: ${error.message}`);
  }
}

export type DeleteUserOptions = {
  stripe?: Stripe | null;
  /** When true, block if profile still shows active/trialing and Stripe cancel fails. */
  strictBilling?: boolean;
};

/** Cancel Stripe (best-effort), delete app rows, delete auth.users row. */
export async function purgeUserAccount(
  admin: SupabaseClient,
  userId: string,
  opts: DeleteUserOptions = {},
): Promise<void> {
  const { data: prof } = await admin
    .from("profiles")
    .select("stripe_customer_id, subscription_status")
    .eq("id", userId)
    .maybeSingle();

  const customerId = prof?.stripe_customer_id as string | undefined;
  const subStatus = (prof?.subscription_status as string | undefined) ?? "none";
  const hasBillableSub = subStatus === "active" || subStatus === "trialing";
  const stripe = opts.stripe ?? null;

  if (customerId && stripe) {
    try {
      await cancelStripeSubscriptions(stripe, customerId);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      console.error("stripe cancel failed", msg);
      if (opts.strictBilling && hasBillableSub) {
        throw new Error(
          "Could not cancel the user's subscription. Cancel billing first, then try again.",
        );
      }
      if (isMissingStripeCustomer(e)) {
        await admin.from("profiles").update({ stripe_customer_id: null }).eq("id", userId);
      }
      console.warn("stripe cleanup skipped for non-billable account", userId, msg);
    }
  }

  await deleteUserData(admin, userId);

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) throw new Error(delErr.message);
}
