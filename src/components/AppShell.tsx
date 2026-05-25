import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Package, Receipt, Wallet, LogOut, Menu, Store, HandCoins } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/products", label: "Produits", icon: Package },
  { to: "/sales", label: "Ventes", icon: Receipt },
  { to: "/expenses", label: "Dépenses", icon: Wallet },
  { to: "/debts", label: "Dettes", icon: HandCoins },
] as const;

function NavList({ onClick }: { onClick?: () => void }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((n) => {
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
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-gradient-gold grid place-items-center text-gold-foreground font-display font-bold">T</div>
          <div>
            <div className="font-display text-base font-semibold leading-tight">Teranga</div>
            <div className="text-[11px] text-sidebar-foreground/60">Gestion boutique</div>
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

export function AppShell() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen flex w-full bg-background">
      <aside className="hidden lg:block w-64 shrink-0 border-r border-border/60">
        <SidebarInner />
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center justify-between p-4 border-b border-border/60 bg-card">
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-accent" />
            <span className="font-display font-semibold">Teranga</span>
          </div>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SidebarInner onNav={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>
        <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
