import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PLAN_PRICES = { monthly: 15000, yearly: 150000 } as const;
const PLAN_LABEL = { monthly: "Abonnement mensuel Teranga", yearly: "Abonnement annuel Teranga" } as const;

function paydunyaBase() {
  // Live mode
  return "https://app.paydunya.com/api/v1";
}

function paydunyaHeaders() {
  return {
    "Content-Type": "application/json",
    "PAYDUNYA-MASTER-KEY": process.env.PAYDUNYA_MASTER_KEY!,
    "PAYDUNYA-PRIVATE-KEY": process.env.PAYDUNYA_PRIVATE_KEY!,
    "PAYDUNYA-TOKEN": process.env.PAYDUNYA_TOKEN!,
  };
}

export const getSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("subscription_status, subscription_expires_at, trial_ends_at, owner_name")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const createSubscriptionInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      plan: z.enum(["monthly", "yearly"]),
      paymentMethod: z.enum(["orange-money-senegal", "wave-senegal"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const amount = PLAN_PRICES[data.plan];

    // Get shop_id
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("shop_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!roleRow) throw new Error("Boutique introuvable");

    const origin = process.env.APP_PUBLIC_URL ?? "https://teural.lovable.app";

    const body = {
      invoice: {
        total_amount: amount,
        description: PLAN_LABEL[data.plan],
      },
      store: { name: "Teranga" },
      custom_data: {
        user_id: userId,
        shop_id: roleRow.shop_id,
        plan: data.plan,
      },
      actions: {
        callback_url: `${origin}/api/public/paydunya-ipn`,
        return_url: `${origin}/subscription?status=success`,
        cancel_url: `${origin}/subscription?status=cancelled`,
      },
    };

    const res = await fetch(`${paydunyaBase()}/checkout-invoice/create`, {
      method: "POST",
      headers: paydunyaHeaders(),
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as {
      response_code?: string;
      response_text?: string;
      description?: string;
      token?: string;
      url?: string;
    };

    if (json.response_code !== "00" || !json.token || !json.url) {
      throw new Error(json.response_text || json.description || "Erreur PayDunya");
    }

    // Persist pending payment
    await supabaseAdmin.from("subscription_payments").insert({
      user_id: userId,
      shop_id: roleRow.shop_id,
      plan: data.plan,
      amount,
      currency: "XOF",
      payment_method: data.paymentMethod,
      paydunya_token: json.token,
      status: "pending",
    });

    return { url: json.url, token: json.token };
  });
