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

async function assertOwnerOfAgent(shopId: string, agentId: string) {
  const { data: target } = await supabaseAdmin
    .from("user_roles")
    .select("role, shop_id")
    .eq("user_id", agentId)
    .maybeSingle();
  if (!target || target.shop_id !== shopId) throw new Error("Agent introuvable");
  if (target.role === "owner") throw new Error("Action interdite sur le propriétaire");
}

export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const shopId = await getOwnerShopId(supabase, userId);

    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (roles ?? []).map((r) => r.user_id);
    if (ids.length === 0) return { agents: [] as Array<{ id: string; email: string; name: string | null; role: string; created_at: string }> };

    // Use admin to bypass RLS for profiles
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, owner_name")
      .in("id", ids);

    const emails = new Map<string, string>();
    const names = new Map<string, string | null>();
    for (const id of ids) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(id);
      if (u?.user?.email) emails.set(id, u.user.email);
      const metaName = (u?.user?.user_metadata as { owner_name?: string } | undefined)?.owner_name ?? null;
      const profName = profiles?.find((p) => p.id === id)?.owner_name ?? null;
      names.set(id, profName ?? metaName);
    }

    return {
      agents: (roles ?? []).map((r) => ({
        id: r.user_id as string,
        email: emails.get(r.user_id as string) ?? "—",
        name: names.get(r.user_id as string) ?? null,
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

    await supabaseAdmin.from("profiles").upsert({ id: newUserId, owner_name: data.name }, { onConflict: "id" });

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, shop_id: shopId, role: "agent" });
    if (roleErr) {
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(roleErr.message);
    }

    return { ok: true, agent_id: newUserId };
  });

export const updateAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { agent_id: string; name?: string; email?: string; password?: string }) =>
    z.object({
      agent_id: z.string().uuid(),
      name: z.string().min(1).max(120).optional(),
      email: emailSchema.optional(),
      password: z.string().min(6).max(72).optional().or(z.literal("")),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const shopId = await getOwnerShopId(supabase, userId);
    await assertOwnerOfAgent(shopId, data.agent_id);

    const authUpdate: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {};
    if (data.email) authUpdate.email = data.email;
    if (data.password && data.password.length > 0) authUpdate.password = data.password;
    if (data.name) authUpdate.user_metadata = { owner_name: data.name, is_agent: true };

    if (Object.keys(authUpdate).length > 0) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.agent_id, authUpdate);
      if (error) throw new Error(error.message);
    }

    if (data.name) {
      const { error: profErr } = await supabaseAdmin
        .from("profiles")
        .upsert({ id: data.agent_id, owner_name: data.name }, { onConflict: "id" });
      if (profErr) throw new Error(profErr.message);
    }

    return { ok: true };
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
    await assertOwnerOfAgent(shopId, data.agent_id);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.agent_id).eq("shop_id", shopId);
    await supabaseAdmin.auth.admin.deleteUser(data.agent_id);

    return { ok: true };
  });
