import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// PayDunya IPN webhook. PayDunya posts form-encoded data with a `data` JSON payload
// and a `hash` (SHA512 of master key). We verify hash, then update payment + profile.
export const Route = createFileRoute("/api/public/paydunya-ipn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const dataRaw = form.get("data");
        const hash = form.get("hash");
        if (typeof dataRaw !== "string" || typeof hash !== "string") {
          return new Response("Bad request", { status: 400 });
        }

        const masterKey = process.env.PAYDUNYA_MASTER_KEY!;
        const { createHash } = await import("crypto");
        const expected = createHash("sha512").update(masterKey).digest("hex");
        if (hash !== expected) {
          return new Response("Invalid hash", { status: 401 });
        }

        let payload: {
          response_code?: string;
          status?: string;
          invoice?: { token?: string; total_amount?: number };
          custom_data?: { user_id?: string; shop_id?: string; plan?: "monthly" | "yearly" };
          customer?: unknown;
        };
        try {
          payload = JSON.parse(dataRaw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        const token = payload.invoice?.token;
        const status = payload.status;
        const plan = payload.custom_data?.plan;
        const userId = payload.custom_data?.user_id;

        if (!token || !userId || !plan) {
          return new Response("Missing fields", { status: 400 });
        }

        // Only act on completed
        if (status !== "completed") {
          await supabaseAdmin
            .from("subscription_payments")
            .update({ status: status === "cancelled" ? "cancelled" : "failed", updated_at: new Date().toISOString() })
            .eq("paydunya_token", token);
          return new Response("ok");
        }

        const now = new Date();
        const expires = new Date(now);
        if (plan === "monthly") expires.setMonth(expires.getMonth() + 1);
        else expires.setFullYear(expires.getFullYear() + 1);

        await supabaseAdmin
          .from("subscription_payments")
          .update({
            status: "completed",
            paid_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("paydunya_token", token);

        // Extend from current expiry if still active
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("subscription_expires_at")
          .eq("id", userId)
          .maybeSingle();

        const base =
          profile?.subscription_expires_at && new Date(profile.subscription_expires_at) > now
            ? new Date(profile.subscription_expires_at)
            : now;
        const newExpiry = new Date(base);
        if (plan === "monthly") newExpiry.setMonth(newExpiry.getMonth() + 1);
        else newExpiry.setFullYear(newExpiry.getFullYear() + 1);

        await supabaseAdmin
          .from("profiles")
          .update({
            subscription_status: plan,
            subscription_expires_at: newExpiry.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq("id", userId);

        return new Response("ok");
      },
    },
  },
});
