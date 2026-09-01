import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { checkIsAdmin } from "@/lib/admin.functions";

type AppRole = "owner" | "agent";
type SubStatus = "free" | "monthly" | "yearly";

type RoleSnapshot = {
  role: AppRole | null;
  shopId: string | null;
  shopName: string | null;
  isSuspended: boolean;
  subscriptionStatus: SubStatus;
  subscriptionExpiresAt: string | null;
  trialEndsAt: string | null;
  isAdmin: boolean;
};

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

const CACHE_PREFIX = "teural.offline.role.";

function readCache(userId: string): RoleSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + userId);
    return raw ? (JSON.parse(raw) as RoleSnapshot) : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, snap: RoleSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const checkAdmin = useServerFn(checkIsAdmin);

  const { data, isLoading, refetch } = useQuery<RoleSnapshot | null>({
    enabled: !!user,
    queryKey: ["role-subscription", user?.id],
    retry: false,
    queryFn: async () => {
      const cached = user ? readCache(user.id) : null;
      // Offline: the device works on the snapshot saved during the last online session.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (cached) return cached;
      }
      try {
        const [{ data: roleRow, error: rErr }, { data: profile, error: pErr }, adminRes] = await Promise.all([
          supabase.from("user_roles").select("role, shop_id, shops(name, is_suspended)").eq("user_id", user!.id).maybeSingle(),
          supabase.from("profiles").select("subscription_status, subscription_expires_at, trial_ends_at").eq("id", user!.id).maybeSingle(),
          checkAdmin().catch(() => ({ isAdmin: false })),
        ]);
        if (rErr) throw rErr;
        if (pErr) throw pErr;
        const rawShops = (roleRow as { shops: unknown } | null)?.shops;
        const shopRel = (Array.isArray(rawShops) ? rawShops[0] : rawShops) as { name: string; is_suspended: boolean } | null | undefined;
        const snap: RoleSnapshot = {
          role: (roleRow?.role as AppRole) ?? null,
          shopId: (roleRow?.shop_id as string) ?? null,
          shopName: shopRel?.name ?? null,
          isSuspended: shopRel?.is_suspended ?? false,
          subscriptionStatus: (profile?.subscription_status as SubStatus) ?? "free",
          subscriptionExpiresAt: profile?.subscription_expires_at ?? null,
          trialEndsAt: profile?.trial_ends_at ?? null,
          isAdmin: !!adminRes?.isAdmin,
        };
        writeCache(user!.id, snap);
        return snap;
      } catch (e) {
        if (cached) return cached;
        throw e;
      }
    },
  });

  // Refetch the role/subscription snapshot as soon as the connection comes back.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => void refetch();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refetch]);

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
    isSuspended: data?.isSuspended ?? false,
    loading: isLoading,
    subscriptionStatus: data?.subscriptionStatus ?? "free",
    subscriptionExpiresAt: expires,
    trialEndsAt: trialEnds,
    hasActiveAccess,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);
