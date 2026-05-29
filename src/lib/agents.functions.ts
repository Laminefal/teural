import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const emailSchema = z.string().email().max(255);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getOwnerShopId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("shop_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Aucune boutique trouvée");
  if (data.role !== "owner") throw new Error("Action réservée au propriétaire");
  return data.shop_id as string;
}

export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const shopId = await getOwnerShopId(supabase, userId);

    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("user_id, role, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return { agents: [] as Array<{ id: string; email: string; name: string | null; role: string; created_at: string }> };

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, owner_name")
      .in("id", ids);

    // Fetch emails from auth via admin
    const emails = new Map<string, string>();
    for (const id of ids) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
      if (u?.user?.email) emails.set(id, u.user.email);
    }

    return {
      agents: (roles ?? []).map((r) => ({
        id: r.user_id as string,
        email: emails.get(r.user_id as string) ?? "—",
        name: profiles?.find((p) => p.id === r.user_id)?.owner_name ?? null,
        role: r.role as string,
        created_at: r.created_at as string,
      })),
    };
  });

export const createAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string; name: string }) =>
    z.object({
      email: emailSchema,
      password: z.string().min(6).max(72),
      name: z.string().min(1).max(120),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const shopId = await getOwnerShopId(supabase, userId);

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { owner_name: data.name, is_agent: true },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Création impossible");

    const newUserId = created.user.id;

    // Ensure profile exists (trigger handles it, but safe-guard)
    await supabaseAdmin.from("profiles").upsert({ id: newUserId, owner_name: data.name }, { onConflict: "id" });

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, shop_id: shopId, role: "agent" });
    if (roleErr) {
      // rollback
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(roleErr.message);
    }

    return { ok: true, agent_id: newUserId };
  });

export const deleteAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agent_id: string }) =>
    z.object({ agent_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const shopId = await getOwnerShopId(supabase, userId);

    if (data.agent_id === userId) throw new Error("Vous ne pouvez pas vous retirer vous-même");

    // Verify agent belongs to this shop
    const { data: target } = await supabaseAdmin
      .from("user_roles")
      .select("role, shop_id")
      .eq("user_id", data.agent_id)
      .maybeSingle();
    if (!target || target.shop_id !== shopId) throw new Error("Agent introuvable");
    if (target.role === "owner") throw new Error("Impossible de retirer le propriétaire");

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.agent_id).eq("shop_id", shopId);
    await supabaseAdmin.auth.admin.deleteUser(data.agent_id);

    return { ok: true };
  });
