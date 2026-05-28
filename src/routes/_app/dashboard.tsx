import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Boxes, Receipt, TrendingUp, Wallet, AlertTriangle, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { formatFCFA, formatDateTime } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

type PresetKey = "today" | "7d" | "30d" | "90d" | "month" | "custom";

function getPresetRange(key: PresetKey): DateRange {
  const now = new Date();
  const to = endOfDay(now);
  if (key === "today") return { from: startOfDay(now), to };
  if (key === "7d") { const f = new Date(now); f.setDate(f.getDate() - 6); return { from: startOfDay(f), to }; }
  if (key === "30d") { const f = new Date(now); f.setDate(f.getDate() - 29); return { from: startOfDay(f), to }; }
  if (key === "90d") { const f = new Date(now); f.setDate(f.getDate() - 89); return { from: startOfDay(f), to }; }
  if (key === "month") { const f = new Date(now.getFullYear(), now.getMonth(), 1); return { from: startOfDay(f), to }; }
  return { from: startOfDay(now), to };
}

function formatRange(r: DateRange) {
  const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(d);
  if (!r.from) return "Choisir une période";
  if (!r.to || r.from.toDateString() === r.to.toDateString()) return fmt(r.from);
  return `${fmt(r.from)} — ${fmt(r.to)}`;
}

function Dashboard() {
  const { user } = useAuth();
  const uid = user!.id;

  const [preset, setPreset] = useState<PresetKey>("30d");
  const [range, setRange] = useState<DateRange>(() => getPresetRange("30d"));
  const [open, setOpen] = useState(false);

  const from = range.from ? startOfDay(range.from) : startOfDay(new Date());
  const to = range.to ? endOfDay(range.to) : endOfDay(range.from ?? new Date());

  const { data: stats } = useQuery({
    queryKey: ["dashboard", uid, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const [salesRes, expRes, prodRes, profRes] = await Promise.all([
        supabase.from("sales").select("*").gte("created_at", from.toISOString()).lte("created_at", to.toISOString()).order("created_at", { ascending: false }),
        supabase.from("expenses").select("*").gte("created_at", from.toISOString()).lte("created_at", to.toISOString()),
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

  const activeSales = sales.filter((s: any) => !s.is_cancelled);
  const activeExpenses = expenses.filter((e: any) => !e.is_cancelled);

  const revenue = activeSales.reduce((a, s) => a + Number(s.total), 0);
  const expensesTotal = activeExpenses.reduce((a, e) => a + Number(e.amount), 0);
  const profit = revenue - expensesTotal;
  const inventoryValue = products.reduce((a, p) => a + Number(p.cost) * Number(p.stock), 0);
  const lowStock = products.filter((p) => Number(p.stock) <= Number(p.low_stock_threshold));

  // chart over selected range (bucket by day, cap at 60 buckets)
  const days = useMemo(() => {
    const out: { date: string; ventes: number; depenses: number }[] = [];
    const msDay = 24 * 60 * 60 * 1000;
    const totalDays = Math.min(Math.max(Math.round((to.getTime() - from.getTime()) / msDay) + 1, 1), 90);
    const startMs = startOfDay(from).getTime();
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startMs + i * msDay);
      const next = new Date(d.getTime() + msDay);
      const v = activeSales.filter((s) => { const sd = new Date(s.created_at); return sd >= d && sd < next; }).reduce((a, s) => a + Number(s.total), 0);
      const e = activeExpenses.filter((x) => { const sd = new Date(x.created_at); return sd >= d && sd < next; }).reduce((a, x) => a + Number(x.amount), 0);
      out.push({ date: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }), ventes: v, depenses: e });
    }
    return out;
  }, [activeSales, activeExpenses, from, to]);

  const applyPreset = (k: PresetKey) => {
    setPreset(k);
    if (k !== "custom") setRange(getPresetRange(k));
  };

  const presets: { key: PresetKey; label: string }[] = [
    { key: "today", label: "Aujourd'hui" },
    { key: "7d", label: "7 jours" },
    { key: "30d", label: "30 jours" },
    { key: "90d", label: "90 jours" },
    { key: "month", label: "Ce mois" },
  ];

  return (
    <div>
      <PageHeader
        title={`Bonjour${stats?.profile?.owner_name ? `, ${stats.profile.owner_name.split(" ")[0]}` : ""} 👋`}
        subtitle={stats?.profile?.shop_name ?? "Votre tableau de bord"}
      />

      <Card className="mb-6 p-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? "default" : "outline"}
              onClick={() => applyPreset(p.key)}
              className="h-8"
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={preset === "custom" ? "default" : "outline"}
                size="sm"
                className={cn("h-8 justify-start gap-2 font-normal", !range.from && "text-muted-foreground")}
              >
                <CalendarIcon className="h-4 w-4" />
                {formatRange(range)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={range}
                onSelect={(r) => {
                  if (r) {
                    setRange(r);
                    setPreset("custom");
                    if (r.from && r.to) setOpen(false);
                  }
                }}
                numberOfMonths={1}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Chiffre d'affaires" value={formatFCFA(revenue)} icon={Receipt} accent="emerald" trend={`${activeSales.length} ventes`} />
        <StatCard label="Dépenses" value={formatFCFA(expensesTotal)} icon={Wallet} accent="rose" trend={`${activeExpenses.length} entrées`} />
        <StatCard label="Bénéfice" value={formatFCFA(profit)} icon={TrendingUp} accent="gold" trend={profit >= 0 ? "Positif" : "Négatif"} positive={profit >= 0} />
        <StatCard label="Valeur du stock" value={formatFCFA(inventoryValue)} icon={Boxes} accent="emerald" trend={`${products.length} produits`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Activité — {formatRange(range)}</h3>
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
          <p className="text-sm text-muted-foreground">Aucune vente sur cette période. <Link to="/sales" className="text-accent hover:underline">Enregistrer une vente</Link></p>
        ) : (
          <div className="divide-y divide-border/60">
            {sales.slice(0, 6).map((s) => (
              <div key={s.id} className={cn("flex items-center justify-between py-3", s.is_cancelled && "text-muted-foreground line-through")}>
                <div>
                  <div className="text-sm font-medium">
                    {s.product_name}
                    {s.is_cancelled && <span className="ml-2 inline-block rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive no-underline">Annulée</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDateTime(s.created_at)} · ×{s.quantity}</div>
                </div>
                <div className={cn("text-sm font-semibold", !s.is_cancelled && "text-accent")}>+{formatFCFA(Number(s.total))}</div>
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
