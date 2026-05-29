import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type AppRole = "owner" | "agent";

interface RoleCtx {
  role: AppRole | null;
  shopId: string | null;
  shopName: string | null;
  isOwner: boolean;
  isAgent: boolean;
  loading: boolean;
}

const Ctx = createContext<RoleCtx>({
  role: null, shopId: null, shopName: null, isOwner: false, isAgent: false, loading: true,
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    enabled: !!user,
    queryKey: ["user-role", user?.id],
    queryFn: async () => {
      const { data: roleRow, error } = await supabase
        .from("user_roles")
        .select("role, shop_id, shops(name)")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!roleRow) return { role: null, shopId: null, shopName: null };
      return {
        role: roleRow.role as AppRole,
        shopId: roleRow.shop_id as string,
        shopName: (roleRow as { shops: { name: string } | null }).shops?.name ?? null,
      };
    },
  });

  const value: RoleCtx = {
    role: data?.role ?? null,
    shopId: data?.shopId ?? null,
    shopName: data?.shopName ?? null,
    isOwner: data?.role === "owner",
    isAgent: data?.role === "agent",
    loading: isLoading,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useRole = () => useContext(Ctx);
