import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PLAN_PRICES = { monthly: 15000, yearly: 150000 } as const;

// Lien marchand Wave (le paramètre amount est ajusté selon le plan)
const WAVE_BASE_URL = "https://pay.wave.com/m/M_sn_hCGRH3TAuixY/c/sn/";
// Numéro Orange Money à afficher au client
export const ORANGE_MONEY_NUMBER = "+221 78 381 93 49";

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

/**
 * Crée une demande de paiement en attente.
 * - Pour Wave : retourne l'URL de paiement Wave (le client est redirigé).
 * - Pour Orange Money : pas d'URL, le client paie manuellement vers le numéro affiché.
 * Dans les deux cas un enregistrement `pending` est créé et devra être validé
 * manuellement par un administrateur après réception du paiement.
 */
export const requestSubscriptionPayment = createServerFn({ method: "POST" })
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

    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("shop_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!roleRow) throw new Error("Boutique introuvable");

    const { data: inserted, error } = await supabaseAdmin
      .from("subscription_payments")
      .insert({
        user_id: userId,
        shop_id: roleRow.shop_id,
        plan: data.plan,
        amount,
        currency: "XOF",
        payment_method: data.paymentMethod,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw error;

    if (data.paymentMethod === "wave-senegal") {
      const url = `${WAVE_BASE_URL}?amount=${amount}`;
      return { paymentId: inserted.id, redirectUrl: url, instructions: null };
    }

    // Orange Money : instructions affichées au client
    return {
      paymentId: inserted.id,
      redirectUrl: null,
      instructions: {
        number: ORANGE_MONEY_NUMBER,
        amount,
      },
    };
  });

/**
 * Marque le paiement créé comme "en attente de validation" côté client
 * (le client a cliqué "J'ai payé"). L'activation effective de l'abonnement
 * reste manuelle : un admin doit confirmer la réception des fonds.
 */
export const confirmPaymentSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin
      .from("subscription_payments")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", data.paymentId)
      .eq("user_id", userId);
    if (error) throw error;
    return { ok: true };
  });
