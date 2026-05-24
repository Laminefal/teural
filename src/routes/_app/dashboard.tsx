import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Boxes, Receipt, TrendingUp, Wallet, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { formatFCFA, formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function startOfDay(d = new Date()) { const x = new Date(d); x.setHours(0,0,0,0); return x; }

function Dashboard() {
  const { user } = useAuth();
  const uid = user!.id;

  const { data: stats } = useQuery({
    queryKey: ["dashboard", uid],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const [salesRes, expRes, prodRes, profRes] = await Promise.all([
        supabase.from("sales").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
        supabase.from("expenses").select("*").gte("created_at", since.toISOString()),
        supabase.from("products").select("*"),
        supabase.from("profiles").select("shop_name, owner_name").eq("id", uid).maybeSingle(),
      ]);
      return {
        sales: salesRes.data ?? [],
        expenses: expRes.data ?? [],
        products: prodRes.data ?? [],
        profile: profRes.data,
      };
    },
  });

  const sales = stats?.sales ?? [];
  const expenses = stats?.expenses ?? [];
  const products = stats?.products ?? [];

  const today = startOfDay();
  const salesToday = sales.filter((s) => new Date(s.created_at) >= today);
  const expensesToday = expenses.filter((e) => new Date(e.created_at) >= today);

  const revenueToday = salesToday.reduce((a, s) => a + Number(s.total), 0);
  const expensesTodayTotal = expensesToday.reduce((a, e) => a + Number(e.amount), 0);
  const revenue30 = sales.reduce((a, s) => a + Number(s.total), 0);
  const profit30 = revenue30 - expenses.reduce((a, e) => a + Number(e.amount), 0);
  const inventoryValue = products.reduce((a, p) => a + Number(p.cost) * Number(p.stock), 0);

  const lowStock = products.filter((p) => Number(p.stock) <= Number(p.low_stock_threshold));

  // chart: last 14 days
  const days: { date: string; ventes: number; depenses: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    const v = sales.filter((s) => { const sd = new Date(s.created_at); return sd >= d && sd < next; }).reduce((a, s) => a + Number(s.total), 0);
    const e = expenses.filter((x) => { const sd = new Date(x.created_at); return sd >= d && sd < next; }).reduce((a, x) => a + Number(x.amount), 0);
    days.push({ date: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }), ventes: v, depenses: e });
  }

  return (
    <div>
      <PageHeader
        title={`Bonjour${stats?.profile?.owner_name ? `, ${stats.profile.owner_name.split(" ")[0]}` : ""} 👋`}
        subtitle={stats?.profile?.shop_name ?? "Votre tableau de bord"}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Ventes du jour" value={formatFCFA(revenueToday)} icon={Receipt} accent="emerald" trend={`${salesToday.length} ventes`} />
        <StatCard label="Dépenses du jour" value={formatFCFA(expensesTodayTotal)} icon={Wallet} accent="rose" trend={`${expensesToday.length} entrées`} />
        <StatCard label="Bénéfice (30 j)" value={formatFCFA(profit30)} icon={TrendingUp} accent="gold" trend={profit30 >= 0 ? "Positif" : "Négatif"} positive={profit30 >= 0} />
        <StatCard label="Valeur du stock" value={formatFCFA(inventoryValue)} icon={Boxes} accent="emerald" trend={`${products.length} produits`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Activité — 14 derniers jours</h3>
              <p className="text-xs text-muted-foreground">Ventes vs dépenses (FCFA)</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={days}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.55 0.13 165)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.55 0.13 165)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.13 85)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.78 0.13 85)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.88 0.02 110)" />
                <XAxis dataKey="date" fontSize={11} stroke="oklch(0.48 0.03 160)" />
                <YAxis fontSize={11} stroke="oklch(0.48 0.03 160)" tickFormatter={(v) => `${Math.round(v/1000)}k`} />
                <Tooltip
                  contentStyle={{ background: "oklch(1 0 0)", border: "1px solid oklch(0.88 0.02 110)", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => formatFCFA(v)}
                />
                <Area type="monotone" dataKey="ventes" stroke="oklch(0.45 0.11 165)" strokeWidth={2} fill="url(#g1)" />
                <Area type="monotone" dataKey="depenses" stroke="oklch(0.68 0.15 70)" strokeWidth={2} fill="url(#g2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">Stock bas</h3>
            <Badge variant={lowStock.length ? "destructive" : "secondary"}>{lowStock.length}</Badge>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tout va bien, aucun produit en alerte.</p>
          ) : (
            <ul className="space-y-3">
              {lowStock.slice(0, 6).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">Seuil {p.low_stock_threshold}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-destructive text-sm font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" /> {p.stock}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Link to="/products" className="mt-4 inline-block text-xs font-medium text-accent hover:underline">Gérer les produits →</Link>
        </Card>
      </div>

      <Card className="mt-6 p-6">
        <h3 className="font-display text-lg font-semibold mb-4">Ventes récentes</h3>
        {sales.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune vente enregistrée. <Link to="/sales" className="text-accent hover:underline">Enregistrer une vente</Link></p>
        ) : (
          <div className="divide-y divide-border/60">
            {sales.slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="text-sm font-medium">{s.product_name}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(s.created_at)} · ×{s.quantity}</div>
                </div>
                <div className="text-sm font-semibold text-accent">+{formatFCFA(Number(s.total))}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, accent, trend, positive,
}: {
  label: string; value: string; icon: any; accent: "emerald" | "gold" | "rose"; trend?: string; positive?: boolean;
}) {
  const bg = accent === "emerald" ? "bg-gradient-emerald text-primary-foreground" : accent === "gold" ? "bg-gradient-gold text-gold-foreground" : "bg-destructive/10 text-destructive";
  return (
    <Card className="p-5 shadow-soft transition-shadow hover:shadow-glow">
      <div className="flex items-start justify-between">
        <div className={`h-10 w-10 rounded-xl grid place-items-center ${bg}`}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            {positive === undefined ? null : positive ? <ArrowUpRight className="h-3 w-3 text-accent" /> : <ArrowDownRight className="h-3 w-3 text-destructive" />}
            {trend}
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 font-display text-2xl font-bold">{value}</div>
      </div>
    </Card>
  );
}
