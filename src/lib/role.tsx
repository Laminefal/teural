import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { checkIsAdmin } from "@/lib/admin.functions";

type AppRole = "owner" | "agent";
type SubStatus = "free" | "monthly" | "yearly";

interface RoleCtx {
  role: AppRole | null;
  shopId: string | null;
  shopName: string | null;
  isOwner: boolean;
  isAgent: boolean;
  isAdmin: boolean;
  isSuspended: boolean;
  loading: boolean;
  subscriptionStatus: SubStatus;
  subscriptionExpiresAt: Date | null;
  trialEndsAt: Date | null;
  hasActiveAccess: boolean;
}

const Ctx = createContext<RoleCtx>({
  role: null, shopId: null, shopName: null, isOwner: false, isAgent: false, isAdmin: false, isSuspended: false, loading: true,
  subscriptionStatus: "free", subscriptionExpiresAt: null, trialEndsAt: null, hasActiveAccess: false,
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const checkAdmin = useServerFn(checkIsAdmin);

  const { data, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["role-subscription", user?.id],
    queryFn: async () => {
      const [{ data: roleRow, error: rErr }, { data: profile, error: pErr }, adminRes] = await Promise.all([
        supabase.from("user_roles").select("role, shop_id, shops(name)").eq("user_id", user!.id).maybeSingle(),
        supabase.from("profiles").select("subscription_status, subscription_expires_at, trial_ends_at").eq("id", user!.id).maybeSingle(),
        checkAdmin().catch(() => ({ isAdmin: false })),
      ]);
      if (rErr) throw rErr;
      if (pErr) throw pErr;
      return {
        role: (roleRow?.role as AppRole) ?? null,
        shopId: (roleRow?.shop_id as string) ?? null,
        shopName: (roleRow as { shops: { name: string } | null } | null)?.shops?.name ?? null,
        subscriptionStatus: (profile?.subscription_status as SubStatus) ?? "free",
        subscriptionExpiresAt: profile?.subscription_expires_at ?? null,
        trialEndsAt: profile?.trial_ends_at ?? null,
        isAdmin: !!adminRes?.isAdmin,
      };
    },
  });

  const now = new Date();
  const expires = data?.subscriptionExpiresAt ? new Date(data.subscriptionExpiresAt) : null;
  const trialEnds = data?.trialEndsAt ? new Date(data.trialEndsAt) : null;
  const subActive = !!expires && expires > now && (data?.subscriptionStatus === "monthly" || data?.subscriptionStatus === "yearly");
  const trialActive = !subActive && !!trialEnds && trialEnds > now;
  const isAdmin = !!data?.isAdmin;
  const hasActiveAccess = isAdmin || data?.role === "agent" ? true : (subActive || trialActive);

  const value: RoleCtx = {
    role: data?.role ?? null,
    shopId: data?.shopId ?? null,
    shopName: data?.shopName ?? null,
    isOwner: data?.role === "owner",
    isAgent: data?.role === "agent",
    isAdmin,
    loading: isLoading,
    subscriptionStatus: data?.subscriptionStatus ?? "free",
    subscriptionExpiresAt: expires,
    trialEndsAt: trialEnds,
    hasActiveAccess,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);
