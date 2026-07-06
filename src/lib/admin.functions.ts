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

    const { data: adminRows } = await supabaseAdmin.from("admin_users").select("user_id");
    const adminIds = (adminRows ?? []).map((a) => a.user_id);

    const totalOwnersQ = supabaseAdmin.from("shops").select("*", { count: "exact", head: true });
    const activeSubsQ = supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .neq("subscription_status", "free")
      .gt("subscription_expires_at", now.toISOString());
    const expiringQ = supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .neq("subscription_status", "free")
      .gt("subscription_expires_at", now.toISOString())
      .lte("subscription_expires_at", in7);

    if (adminIds.length) {
      totalOwnersQ.not("owner_id", "in", `(${adminIds.join(",")})`);
      activeSubsQ.not("id", "in", `(${adminIds.join(",")})`);
      expiringQ.not("id", "in", `(${adminIds.join(",")})`);
    }

    const [{ count: totalOwners }, { count: activeSubs }, { count: expiring }] = await Promise.all([
      totalOwnersQ, activeSubsQ, expiringQ,
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

    const { data: rolesRaw, error: rErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, shop_id, shops(name, is_suspended)")
      .eq("role", "owner");
    if (rErr) throw rErr;

    // Exclude admin accounts — they don't have a subscription
    const { data: adminRows } = await supabaseAdmin.from("admin_users").select("user_id");
    const adminIds = new Set((adminRows ?? []).map((a) => a.user_id));
    const roles = (rolesRaw ?? []).filter((r) => !adminIds.has(r.user_id));

    const userIds = roles.map((r) => r.user_id);
    if (userIds.length === 0) return [];

    const { data: profilesRaw, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, owner_name, subscription_status, subscription_expires_at, trial_ends_at, created_at")
      .in("id", userIds);
    if (pErr) throw pErr;
    const profiles = profilesRaw as unknown as Array<{
      id: string; owner_name: string | null; subscription_status: string | null;
      subscription_expires_at: string | null; trial_ends_at: string | null;
      created_at: string | null;
    }> | null;

    // Sales aggregates per user
    const { data: salesAgg } = await supabaseAdmin
      .from("sales")
      .select("user_id, total, is_cancelled")
      .in("user_id", userIds);

    const salesByUser = new Map<string, { count: number; revenue: number }>();
    (salesAgg ?? []).forEach((s) => {
      if (s.is_cancelled) return;
      const cur = salesByUser.get(s.user_id) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += Number(s.total ?? 0);
      salesByUser.set(s.user_id, cur);
    });

    // Products counts
    const { data: prodAgg } = await supabaseAdmin
      .from("products")
      .select("user_id, stock")
      .in("user_id", userIds);
    const productsByUser = new Map<string, { count: number; stock: number }>();
    (prodAgg ?? []).forEach((p) => {
      const cur = productsByUser.get(p.user_id) ?? { count: 0, stock: 0 };
      cur.count += 1;
      cur.stock += Number(p.stock ?? 0);
      productsByUser.set(p.user_id, cur);
    });

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

    return roles.map((r) => {
      const p = profiles?.find((x) => x.id === r.user_id);
      const a = authMap.get(r.user_id);
      const s = salesByUser.get(r.user_id) ?? { count: 0, revenue: 0 };
      const pr = productsByUser.get(r.user_id) ?? { count: 0, stock: 0 };
      return {
        userId: r.user_id,
        shopId: r.shop_id as string,
        shopName: (r as { shops: { name: string; is_suspended: boolean } | null }).shops?.name ?? null,
        isSuspended: (r as { shops: { name: string; is_suspended: boolean } | null }).shops?.is_suspended ?? false,
        ownerName: p?.owner_name ?? null,
        email: a?.email ?? null,
        phone: a?.phone ?? null,
        quartier: null,
        ville: null,
        subscriptionStatus: (p?.subscription_status as string) ?? "free",
        subscriptionExpiresAt: p?.subscription_expires_at ?? null,
        trialEndsAt: p?.trial_ends_at ?? null,
        createdAt: p?.created_at ?? null,
        lastSignInAt: a?.last_sign_in_at ?? null,
        salesCount: s.count,
        revenue: s.revenue,
        productsCount: pr.count,
        stockTotal: pr.stock,
      };
    });
  });

export const adminSetShopSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ shopId: z.string().uuid(), suspended: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("shops")
      .update({ is_suspended: data.suspended })
      .eq("id", data.shopId);
    if (error) throw error;
    return { ok: true };
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
      .select("subscription_expires_at, subscription_status")
      .eq("id", data.userId)
      .maybeSingle();
    const base = p?.subscription_expires_at && new Date(p.subscription_expires_at) > new Date()
      ? new Date(p.subscription_expires_at)
      : new Date();
    const next = new Date(base.getTime() + data.days * 24 * 3600 * 1000).toISOString();
    const update: { subscription_expires_at: string; subscription_status?: string } = {
      subscription_expires_at: next,
    };
    // If currently free/expired, mark as monthly so the gift takes effect
    if (!p?.subscription_status || p.subscription_status === "free") {
      update.subscription_status = "monthly";
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(update)
      .eq("id", data.userId);
    if (error) throw error;
    return { ok: true, expiresAt: next };
  });

export const adminGeneratePaymentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { url: `${WAVE_BASE_URL}?amount=${MONTHLY_PRICE}`, userId: data.userId };
  });

/* ============================================================
   USER DETAIL & MANAGEMENT
   ============================================================ */

export const listShopsWithMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: shops, error: sErr } = await supabaseAdmin
      .from("shops")
      .select("id, name, owner_id, created_at")
      .order("created_at", { ascending: false });
    if (sErr) throw sErr;

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, shop_id, role");

    const userIds = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (userIds.length === 0) {
      return (shops ?? []).map((s) => ({ ...s, members: [] as Array<{ userId: string; role: string; name: string | null; email: string | null; phone: string | null }> }));
    }

    const { data: profilesRaw } = await supabaseAdmin
      .from("profiles")
      .select("id, owner_name")
      .in("id", userIds);
    const profiles = (profilesRaw ?? []) as Array<{ id: string; owner_name: string | null }>;

    const authMap = new Map<string, { email: string | null; phone: string | null }>();
    await Promise.all(
      userIds.map(async (uid) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (data?.user) authMap.set(uid, { email: data.user.email ?? null, phone: data.user.phone ?? null });
      }),
    );

    return (shops ?? []).map((s) => {
      const members = (roles ?? [])
        .filter((r) => r.shop_id === s.id)
        .map((r) => {
          const p = profiles.find((x) => x.id === r.user_id);
          const a = authMap.get(r.user_id);
          return {
            userId: r.user_id,
            role: r.role as string,
            name: p?.owner_name ?? null,
            email: a?.email ?? null,
            phone: a?.phone ?? null,
          };
        })
        .sort((a, b) => (a.role === "owner" ? -1 : b.role === "owner" ? 1 : 0));
      return { ...s, members };
    });
  });


export const getOwnerDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const uid = data.userId;

    const [authRes, profileRes, roleRes, paymentsRes, productsRes, salesRes] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(uid),
      supabaseAdmin
        .from("profiles")
        .select("id, owner_name, shop_name, avatar_url, subscription_status, subscription_expires_at, trial_ends_at, created_at, shop_quartier, shop_ville, shop_photo_url" as "*")
        .eq("id", uid)
        .maybeSingle(),
      supabaseAdmin
        .from("user_roles")
        .select("role, shop_id, shops(name)")
        .eq("user_id", uid)
        .maybeSingle(),
      supabaseAdmin
        .from("subscription_payments")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("products")
        .select("id, name, stock, price, cost, category")
        .eq("user_id", uid)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("sales")
        .select("total, is_cancelled")
        .eq("user_id", uid),
    ]);

    const sales = (salesRes.data ?? []).filter((s) => !s.is_cancelled);
    const revenue = sales.reduce((sum, s) => sum + Number(s.total ?? 0), 0);
    const products = productsRes.data ?? [];
    const stockTotal = products.reduce((sum, p) => sum + Number(p.stock ?? 0), 0);
    const stockValue = products.reduce(
      (sum, p) => sum + Number(p.stock ?? 0) * Number(p.cost ?? p.price ?? 0),
      0,
    );

    return {
      auth: {
        email: authRes.data?.user?.email ?? null,
        phone: authRes.data?.user?.phone ?? null,
        lastSignInAt: authRes.data?.user?.last_sign_in_at ?? null,
        createdAt: authRes.data?.user?.created_at ?? null,
      },
      profile: profileRes.data,
      role: {
        role: (roleRes.data?.role as string) ?? null,
        shopId: (roleRes.data?.shop_id as string) ?? null,
        shopName: (roleRes.data as { shops: { name: string } | null } | null)?.shops?.name ?? null,
      },
      payments: paymentsRes.data ?? [],
      products,
      stats: {
        salesCount: sales.length,
        revenue,
        productsCount: products.length,
        stockTotal,
        stockValue,
      },
    };
  });

export const adminUpdateOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      userId: z.string().uuid(),
      ownerName: z.string().trim().max(120).optional(),
      email: z.string().trim().email().max(255).optional(),
      phone: z.string().trim().max(30).optional(),
      shopName: z.string().trim().max(120).optional(),
      quartier: z.string().trim().max(120).optional().nullable(),
      ville: z.string().trim().max(120).optional().nullable(),
      shopPhotoUrl: z.string().trim().url().max(500).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Update auth.users (email / phone) if provided
    const authPayload: { email?: string; phone?: string } = {};
    if (data.email) authPayload.email = data.email;
    if (data.phone) authPayload.phone = data.phone;
    if (Object.keys(authPayload).length > 0) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, authPayload);
      if (error) throw error;
    }

    // Update profile
    const profileUpdate: Record<string, unknown> = {};
    if (data.ownerName !== undefined) profileUpdate.owner_name = data.ownerName;
    if (data.shopName !== undefined) profileUpdate.shop_name = data.shopName;
    if (data.quartier !== undefined) profileUpdate.shop_quartier = data.quartier;
    if (data.ville !== undefined) profileUpdate.shop_ville = data.ville;
    if (data.shopPhotoUrl !== undefined) profileUpdate.shop_photo_url = data.shopPhotoUrl;
    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdate as never)
        .eq("id", data.userId);
      if (error) throw error;
    }

    // Update shop name in shops table too
    if (data.shopName !== undefined) {
      const { data: role } = await supabaseAdmin
        .from("user_roles")
        .select("shop_id")
        .eq("user_id", data.userId)
        .maybeSingle();
      if (role?.shop_id) {
        await supabaseAdmin.from("shops").update({ name: data.shopName }).eq("id", role.shop_id);
      }
    }

    return { ok: true };
  });

export const adminSetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      userId: z.string().uuid(),
      password: z.string().min(6).max(128),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ userId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (!user?.user?.email) throw new Error("Aucun email associé à ce compte");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: user.user.email,
    });
    if (error) throw error;
    return {
      ok: true,
      email: user.user.email,
      link: link?.properties?.action_link ?? null,
    };
  });

export const adminChangeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ userId: z.string().uuid(), role: z.enum(["owner", "agent"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .update({ role: data.role })
      .eq("user_id", data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ userId: z.string().uuid(), confirm: z.literal(true) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // Best-effort cleanup. Deleting auth user typically cascades via FK.
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("shop_id")
      .eq("user_id", data.userId)
      .maybeSingle();
    const shopId = role?.shop_id as string | undefined;

    if (shopId) {
      await supabaseAdmin.from("sales").delete().eq("shop_id", shopId);
      await supabaseAdmin.from("expenses").delete().eq("shop_id", shopId);
      await supabaseAdmin.from("debts").delete().eq("shop_id", shopId);
      await supabaseAdmin.from("products").delete().eq("shop_id", shopId);
      await supabaseAdmin.from("user_roles").delete().eq("shop_id", shopId);
      await supabaseAdmin.from("subscription_payments").delete().eq("shop_id", shopId);
      await supabaseAdmin.from("shops").delete().eq("id", shopId);
    }
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw error;
    return { ok: true };
  });

export const getRevenueStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: paymentsRaw, error } = await supabaseAdmin
      .from("subscription_payments")
      .select("id, amount, currency, status, plan, payment_method, paid_at, created_at, user_id, shop_id")
      .order("created_at", { ascending: false });
    if (error) throw error;
    const payments = paymentsRaw ?? [];

    const paid = payments.filter((p) => {
      const s = (p.status ?? "").toLowerCase();
      return s === "completed" || s === "paid" || s === "success" || s === "succeeded" || !!p.paid_at;
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrev = startOfMonth;
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const totalRevenue = paid.reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const monthRevenue = paid
      .filter((p) => new Date(p.paid_at ?? p.created_at) >= startOfMonth)
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const prevMonthRevenue = paid
      .filter((p) => {
        const d = new Date(p.paid_at ?? p.created_at);
        return d >= startOfPrev && d < endOfPrev;
      })
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    const yearRevenue = paid
      .filter((p) => new Date(p.paid_at ?? p.created_at) >= startOfYear)
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);

    // Monthly series — last 12 months
    const monthly: Array<{ key: string; label: string; revenue: number; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      monthly.push({ key, label, revenue: 0, count: 0 });
    }
    const idx = new Map(monthly.map((m, i) => [m.key, i]));
    paid.forEach((p) => {
      const d = new Date(p.paid_at ?? p.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const i = idx.get(key);
      if (i !== undefined) {
        monthly[i].revenue += Number(p.amount ?? 0);
        monthly[i].count += 1;
      }
    });

    // By plan
    const byPlanMap = new Map<string, { plan: string; revenue: number; count: number }>();
    paid.forEach((p) => {
      const k = p.plan ?? "—";
      const cur = byPlanMap.get(k) ?? { plan: k, revenue: 0, count: 0 };
      cur.revenue += Number(p.amount ?? 0);
      cur.count += 1;
      byPlanMap.set(k, cur);
    });

    // By payment method
    const byMethodMap = new Map<string, { method: string; revenue: number; count: number }>();
    paid.forEach((p) => {
      const k = p.payment_method ?? "—";
      const cur = byMethodMap.get(k) ?? { method: k, revenue: 0, count: 0 };
      cur.revenue += Number(p.amount ?? 0);
      cur.count += 1;
      byMethodMap.set(k, cur);
    });

    // Recent payments — enrich with shop name & owner email
    const recent = paid.slice(0, 20);
    const shopIds = Array.from(new Set(recent.map((p) => p.shop_id).filter(Boolean)));
    const userIds = Array.from(new Set(recent.map((p) => p.user_id).filter(Boolean)));
    const [{ data: shops }, { data: profiles }] = await Promise.all([
      shopIds.length
        ? supabaseAdmin.from("shops").select("id, name").in("id", shopIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      userIds.length
        ? supabaseAdmin.from("profiles").select("id, owner_name").in("id", userIds)
        : Promise.resolve({ data: [] as Array<{ id: string; owner_name: string | null }> }),
    ]);
    const shopMap = new Map((shops ?? []).map((s) => [s.id, s.name]));
    const ownerMap = new Map((profiles ?? []).map((p) => [p.id, p.owner_name]));

    const recentEnriched = recent.map((p) => ({
      id: p.id,
      amount: Number(p.amount ?? 0),
      currency: p.currency ?? "XOF",
      plan: p.plan,
      method: p.payment_method,
      status: p.status,
      paidAt: p.paid_at ?? p.created_at,
      shopName: shopMap.get(p.shop_id) ?? "—",
      ownerName: ownerMap.get(p.user_id) ?? "—",
    }));

    return {
      totalRevenue,
      monthRevenue,
      prevMonthRevenue,
      yearRevenue,
      paidCount: paid.length,
      pendingCount: payments.length - paid.length,
      monthly,
      byPlan: Array.from(byPlanMap.values()).sort((a, b) => b.revenue - a.revenue),
      byMethod: Array.from(byMethodMap.values()).sort((a, b) => b.revenue - a.revenue),
      recent: recentEnriched,
    };
  });
