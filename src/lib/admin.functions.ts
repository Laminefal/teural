import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const WAVE_BASE_URL = "https://pay.wave.com/m/M_sn_hCGRH3TAuixY/c/sn/";
const MONTHLY_PRICE = 15000;

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Accès refusé : administrateur uniquement");
}

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("admin_users")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    return { isAdmin: !!data };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();

    const [{ count: totalOwners }, { count: activeSubs }, { count: expiring }] = await Promise.all([
      supabaseAdmin.from("shops").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .neq("subscription_status", "free")
        .gt("subscription_expires_at", now.toISOString()),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .neq("subscription_status", "free")
        .gt("subscription_expires_at", now.toISOString())
        .lte("subscription_expires_at", in7),
    ]);

    return {
      totalOwners: totalOwners ?? 0,
      activeSubs: activeSubs ?? 0,
      monthlyRevenue: (activeSubs ?? 0) * MONTHLY_PRICE,
      expiringSoon: expiring ?? 0,
    };
  });

export const listShopOwners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // All owners via user_roles
    const { data: roles, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, shop_id, shops(name)")
      .eq("role", "owner");
    if (rErr) throw rErr;

    const userIds = (roles ?? []).map((r) => r.user_id);
    if (userIds.length === 0) return [];

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, owner_name, subscription_status, subscription_expires_at, trial_ends_at")
      .in("id", userIds);

    // Fetch auth.users details (email, phone, last_sign_in_at) via admin API
    const authMap = new Map<string, { email: string | null; phone: string | null; last_sign_in_at: string | null }>();
    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (data?.user) {
          authMap.set(uid, {
            email: data.user.email ?? null,
            phone: data.user.phone ?? null,
            last_sign_in_at: data.user.last_sign_in_at ?? null,
          });
        }
      }),
    );

    return (roles ?? []).map((r) => {
      const p = profiles?.find((x) => x.id === r.user_id);
      const a = authMap.get(r.user_id);
      return {
        userId: r.user_id,
        shopId: r.shop_id as string,
        shopName: (r as { shops: { name: string } | null }).shops?.name ?? null,
        ownerName: p?.owner_name ?? null,
        email: a?.email ?? null,
        phone: a?.phone ?? null,
        subscriptionStatus: (p?.subscription_status as string) ?? "free",
        subscriptionExpiresAt: p?.subscription_expires_at ?? null,
        trialEndsAt: p?.trial_ends_at ?? null,
        lastSignInAt: a?.last_sign_in_at ?? null,
      };
    });
  });

export const adminActivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid(), plan: z.enum(["monthly", "yearly"]).default("monthly") }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const days = data.plan === "yearly" ? 365 : 30;
    const expires = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ subscription_status: data.plan, subscription_expires_at: expires })
      .eq("id", data.userId);
    if (error) throw error;
    return { ok: true, expiresAt: expires };
  });

export const adminDeactivateSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ subscription_status: "free", subscription_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const adminExtendSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid(), days: z.number().int().positive().default(30) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: p } = await supabaseAdmin
      .from("profiles")
      .select("subscription_expires_at")
      .eq("id", data.userId)
      .maybeSingle();
    const base = p?.subscription_expires_at && new Date(p.subscription_expires_at) > new Date()
      ? new Date(p.subscription_expires_at)
      : new Date();
    const next = new Date(base.getTime() + data.days * 24 * 3600 * 1000).toISOString();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ subscription_expires_at: next })
      .eq("id", data.userId);
    if (error) throw error;
    return { ok: true, expiresAt: next };
  });

export const adminGeneratePaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // Direct Wave link at 15 000 FCFA (PayDunya retiré)
    return { url: `${WAVE_BASE_URL}?amount=${MONTHLY_PRICE}`, userId: data.userId };
  });
