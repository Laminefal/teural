import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Package, Receipt, Wallet, LogOut, Menu, Store, HandCoins, Users, Crown, ShieldCheck, UserCog, TrendingUp, BarChart3 } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { SyncIndicator } from "@/components/SyncIndicator";

const baseNav = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/products", label: "Produits", icon: Package },
  { to: "/sales", label: "Ventes", icon: Receipt },
  { to: "/expenses", label: "Dépenses", icon: Wallet },
  { to: "/debts", label: "Dettes", icon: HandCoins },
  { to: "/agents", label: "Agents", icon: Users, ownerOnly: true },
  { to: "/subscription", label: "Abonnement", icon: Crown, ownerOnly: true },
  { to: "/admin", label: "Gestion des boutiques", icon: ShieldCheck, adminOnly: true },
  { to: "/admin/users", label: "Gestion des users", icon: UserCog, adminOnly: true },
  { to: "/admin/revenue", label: "Revenus", icon: TrendingUp, adminOnly: true },
  { to: "/admin/analytics", label: "Statistiques", icon: BarChart3, adminOnly: true },

] as const;

function SubscriptionBadge() {
  const { isOwner, isAdmin, subscriptionStatus, subscriptionExpiresAt, trialEndsAt } = useRole();
  if (isAdmin || !isOwner) return null;
  const now = new Date();
  const subActive = !!subscriptionExpiresAt && subscriptionExpiresAt > now && subscriptionStatus !== "free";
  const trialActive = !subActive && !!trialEndsAt && trialEndsAt > now;

  if (subActive) {
    return (
      <Link to="/subscription" search={{ status: undefined }} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 px-2.5 py-1 text-xs font-medium">
        <Crown className="h-3 w-3" />
        Abonné jusqu'au {formatDate(subscriptionExpiresAt!)}
      </Link>
    );
  }
  if (trialActive) {
    return (
      <Link to="/subscription" search={{ status: undefined }} className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-700 border border-amber-500/30 px-2.5 py-1 text-xs font-medium">
        Essai jusqu'au {formatDate(trialEndsAt!)}
      </Link>
    );
  }
  return (
    <Link to="/subscription" search={{ status: undefined }} className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30 px-2.5 py-1 text-xs font-medium">
      Compte expiré · S'abonner
    </Link>
  );
}

function NavList({ onClick }: { onClick?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { isOwner, isAdmin } = useRole();
  const items = baseNav.filter((n) => {
    const x = n as { ownerOnly?: boolean; adminOnly?: boolean };
    if (isAdmin) return !!x.adminOnly;
    if (x.adminOnly) return false;
    if (x.ownerOnly) return isOwner;
    return true;
  });
  return (
    <nav className="flex flex-col gap-1">
      {items.map((n) => {
        const active = path === n.to;
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarInner({ onNav }: { onNav?: () => void }) {
  const { user, signOut } = useAuth();
  const { shopName, role } = useRole();
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-gradient-gold grid place-items-center text-gold-foreground font-display font-bold">T</div>
          <div className="min-w-0">
            <div className="font-display text-base font-semibold leading-tight truncate">{shopName ?? "Teranga"}</div>
            <div className="text-[11px] text-sidebar-foreground/60">
              {role === "owner" ? "Propriétaire" : role === "agent" ? "Agent" : "Gestion boutique"}
            </div>
          </div>
        </div>
      </div>
      <div className="flex-1 p-3"><NavList onClick={onNav} /></div>
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent grid place-items-center text-xs font-semibold">
            {user?.email?.[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{user?.email}</div>
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="h-4 w-4" /> Déconnexion
        </button>
      </div>
    </div>
  );
}

function SuspendedBanner() {
  const { isSuspended, isAdmin } = useRole();
  if (!isSuspended || isAdmin) return null;
  return (
    <div className="bg-red-600 text-white text-sm px-4 py-2 text-center font-medium">
      ⚠️ Boutique suspendue par l'administrateur — mode lecture seule. Aucune modification n'est possible pour le moment.
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const { shopName, isAdmin } = useRole();
  const mobileTitle = shopName ?? (isAdmin ? "Administration" : "Ma boutique");
  return (
    <div className="min-h-screen flex w-full bg-background">

      <aside className="hidden lg:block w-64 shrink-0 border-r border-border/60">
        <SidebarInner />
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <SuspendedBanner />
        <header className="hidden lg:flex items-center justify-end gap-3 px-8 py-3 border-b border-border/60 bg-card/40">
          <SyncIndicator />
          <SubscriptionBadge />
        </header>
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-border/60 bg-card">
          <div className="flex items-center gap-2 min-w-0">
            <Store className="h-5 w-5 text-accent shrink-0" />
            <span className="font-display font-semibold truncate">{mobileTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            <SyncIndicator />
            <SubscriptionBadge />
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72">
                <SidebarInner onNav={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
