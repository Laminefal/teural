import { useMemo, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Search,
  TrendingUp,
  TrendingDown,
  Store,
  Crown,
  Clock,
  XCircle,
  BarChart3,
  Activity,
  Sparkles,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useRole } from "@/lib/role";
import { formatFCFA } from "@/lib/format";
import { getProductStats, getShopsGrowth } from "@/lib/admin.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/admin/analytics")({
  component: AnalyticsPage,
});

/* ============ Palette (Emerald Prestige) ============ */
const EMERALD = "oklch(0.38 0.09 160)";
const EMERALD_LIGHT = "oklch(0.55 0.13 165)";
const GOLD = "oklch(0.78 0.13 85)";
const RED = "oklch(0.58 0.22 27)";
const INK = "oklch(0.22 0.04 160)";

function AnalyticsPage() {
  const { isAdmin, loading } = useRole();
  const fetchProducts = useServerFn(getProductStats);
  const fetchGrowth = useServerFn(getShopsGrowth);

  const pq = useQuery({
    queryKey: ["admin-product-stats"],
    queryFn: () => fetchProducts(),
    enabled: isAdmin,
  });
  const gq = useQuery({
    queryKey: ["admin-shops-growth"],
    queryFn: () => fetchGrowth(),
    enabled: isAdmin,
  });

  if (loading) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: EMERALD_LIGHT }} />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-emerald text-primary-foreground shadow-glow">
        <div className="absolute inset-0 pattern-kente opacity-40" />
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
            <Sparkles className="h-3.5 w-3.5" /> Analytics Suite
          </div>
          <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight">
            Statistiques
          </h1>
          <p className="mt-2 text-sm sm:text-base text-primary-foreground/80 max-w-xl">
            Vue d'ensemble des ventes, des produits phares et de la croissance des boutiques abonnées.
          </p>

          <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <HeroStat
              label="Boutiques"
              value={String(gq.data?.totals.totalShops ?? "—")}
              icon={<Store className="h-4 w-4" />}
            />
            <HeroStat
              label="Abonnés actifs"
              value={String(gq.data?.totals.activeSubsNow ?? "—")}
              icon={<Crown className="h-4 w-4" />}
              accent
            />
            <HeroStat
              label="En essai"
              value={String(gq.data?.totals.trialingNow ?? "—")}
              icon={<Clock className="h-4 w-4" />}
            />
            <HeroStat
              label="Conversion"
              value={
                gq.data
                  ? `${gq.data.totals.conversionRate.toFixed(1)}%`
                  : "—"
              }
              icon={<Activity className="h-4 w-4" />}
            />
          </div>
        </div>
      </div>

      <Tabs defaultValue="products" className="space-y-6">
        <TabsList className="bg-secondary/60 p-1 rounded-full h-11">
          <TabsTrigger value="products" className="rounded-full px-5 h-9 data-[state=active]:bg-gradient-emerald data-[state=active]:text-primary-foreground data-[state=active]:shadow-soft">
            <BarChart3 className="h-4 w-4 mr-2" /> Produits
          </TabsTrigger>
          <TabsTrigger value="growth" className="rounded-full px-5 h-9 data-[state=active]:bg-gradient-emerald data-[state=active]:text-primary-foreground data-[state=active]:shadow-soft">
            <TrendingUp className="h-4 w-4 mr-2" /> Croissance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <ProductsSection data={pq.data} isLoading={pq.isLoading} />
        </TabsContent>

        <TabsContent value="growth">
          <GrowthSection data={gq.data} isLoading={gq.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HeroStat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 backdrop-blur-sm",
        accent
          ? "bg-gold/15 border-gold/40"
          : "bg-white/5 border-white/10",
      )}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-primary-foreground/70">
        <span>{label}</span>
        <span className={cn("grid h-7 w-7 place-items-center rounded-full", accent ? "bg-gold text-gold-foreground" : "bg-white/10")}>
          {icon}
        </span>
      </div>
      <div className="mt-3 font-display text-2xl sm:text-3xl font-bold">
        {value}
      </div>
    </div>
  );
}

/* ============ PRODUCTS ============ */

type ProductStats = Awaited<ReturnType<typeof getProductStats>>;

function ProductsSection({
  data,
  isLoading,
}: {
  data: ProductStats | undefined;
  isLoading: boolean;
}) {
  const [shopId, setShopId] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [limit, setLimit] = useState<string>("10");
  const [search, setSearch] = useState("");

  const items = data?.items ?? [];
  const shops = data?.shops ?? [];
  const categories = data?.categories ?? [];

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (shopId !== "all" && it.shopId !== shopId) return false;
      if (category !== "all" && it.category !== category) return false;
      return true;
    });
  }, [items, shopId, category]);

  const top = useMemo(
    () =>
      [...filtered]
        .filter((it) => it.unitsSold > 0)
        .sort((a, b) => b.unitsSold - a.unitsSold)
        .slice(0, Number(limit)),
    [filtered, limit],
  );

  const bottom = useMemo(
    () =>
      [...filtered]
        .sort((a, b) => a.unitsSold - b.unitsSold)
        .slice(0, Number(limit)),
    [filtered, limit],
  );

  const totals = useMemo(() => {
    const units = filtered.reduce((s, x) => s + x.unitsSold, 0);
    const revenue = filtered.reduce((s, x) => s + x.revenue, 0);
    return { units, revenue, count: filtered.length };
  }, [filtered]);

  const searchResult = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    const matches = filtered.filter((it) => it.name.toLowerCase().includes(q));
    if (matches.length === 0) return { matches: [], rank: null, total: 0 };
    const ranked = [...filtered].sort((a, b) => b.unitsSold - a.unitsSold);
    const total = ranked.length;
    const enriched = matches.map((m) => {
      const rank = ranked.findIndex((r) => r.key === m.key) + 1;
      const percentile = total > 0 ? ((total - rank) / total) * 100 : 0;
      let verdict: "excellent" | "bon" | "moyen" | "faible" | "aucune" = "aucune";
      if (m.unitsSold === 0) verdict = "aucune";
      else if (percentile >= 75) verdict = "excellent";
      else if (percentile >= 50) verdict = "bon";
      else if (percentile >= 25) verdict = "moyen";
      else verdict = "faible";
      return { ...m, rank, percentile, verdict };
    });
    return { matches: enriched, total };
  }, [search, filtered]);

  return (
    <div className="space-y-6">
      {/* Filters + mini KPIs bento */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <Card className="p-5 rounded-2xl border-border/60 shadow-soft">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Filtres
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FilterField label="Zone / Boutique">
              <Select value={shopId} onValueChange={setShopId}>
                <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les boutiques</SelectItem>
                  {shops.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Catégorie">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes catégories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Nombre à afficher">
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger className="rounded-xl h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["5", "10", "20", "50", "100"].map((n) => (
                    <SelectItem key={n} value={n}>Top / Flop {n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Rechercher un produit">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nom du produit…"
                  className="pl-9 h-10 rounded-xl"
                />
              </div>
            </FilterField>
          </div>
        </Card>

        <div className="grid grid-cols-3 lg:grid-cols-1 gap-3 lg:w-56">
          <MiniStat label="Produits" value={String(totals.count)} tone="emerald" />
          <MiniStat label="Unités" value={String(totals.units)} tone="gold" />
          <MiniStat label="Revenus" value={formatFCFA(totals.revenue)} tone="ink" />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="p-16 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: EMERALD_LIGHT }} />
        </div>
      ) : (
        <>
          {searchResult && (
            <Card className="p-5 rounded-2xl border-border/60 shadow-soft">
              <div className="text-sm font-semibold mb-4 flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-gold/20 text-gold-foreground">
                  <Search className="h-4 w-4" />
                </div>
                Résultats de recherche
                <Badge variant="secondary" className="ml-1">{searchResult.matches.length}</Badge>
              </div>
              {searchResult.matches.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  Aucun produit ne correspond à «&nbsp;{search}&nbsp;».
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-border/60">
                        <TableHead>Produit</TableHead>
                        <TableHead>Boutique</TableHead>
                        <TableHead className="text-right">Unités vendues</TableHead>
                        <TableHead className="text-right">Revenus</TableHead>
                        <TableHead className="text-right">Rang</TableHead>
                        <TableHead>Verdict</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {searchResult.matches.map((m) => (
                        <TableRow key={m.key} className="border-border/40">
                          <TableCell className="font-medium">{m.name}</TableCell>
                          <TableCell className="text-muted-foreground">{m.shopName}</TableCell>
                          <TableCell className="text-right font-mono">{m.unitsSold}</TableCell>
                          <TableCell className="text-right font-mono">{formatFCFA(m.revenue)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            #{m.rank} / {searchResult.total}
                          </TableCell>
                          <TableCell><VerdictBadge verdict={m.verdict} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <ProductChartCard
              title="Produits les plus vendus"
              subtitle="Top des ventes par unités"
              icon={<TrendingUp className="h-4 w-4" />}
              rows={top}
              tone="up"
            />
            <ProductChartCard
              title="Produits les moins vendus"
              subtitle="À relancer ou déréférencer"
              icon={<TrendingDown className="h-4 w-4" />}
              rows={bottom}
              tone="down"
            />
          </div>
        </>
      )}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "gold" | "ink";
}) {
  const styles: Record<string, string> = {
    emerald: "bg-gradient-emerald text-primary-foreground",
    gold: "bg-gradient-gold text-gold-foreground",
    ink: "bg-secondary text-secondary-foreground",
  };
  return (
    <div className={cn("rounded-2xl p-4 shadow-soft", styles[tone])}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1.5 font-display text-lg font-bold truncate">{value}</div>
    </div>
  );
}

function ProductChartCard({
  title,
  subtitle,
  icon,
  rows,
  tone,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  rows: ProductStats["items"];
  tone: "up" | "down";
}) {
  const chartData = rows.slice(0, 10).map((r) => ({
    name: r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name,
    units: r.unitsSold,
  }));
  const barColor = tone === "up" ? EMERALD_LIGHT : RED;
  const gradId = tone === "up" ? "gradUp" : "gradDown";

  return (
    <Card className="p-5 rounded-2xl border-border/60 shadow-soft overflow-hidden">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid h-10 w-10 place-items-center rounded-xl",
              tone === "up" ? "bg-gradient-emerald text-primary-foreground" : "bg-destructive/15 text-destructive",
            )}
          >
            {icon}
          </div>
          <div>
            <div className="font-display font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
        <Badge variant="outline" className="rounded-full">{rows.length}</Badge>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-10 text-center">
          Aucun produit à afficher.
        </div>
      ) : (
        <>
          <div className="h-56 -mx-2 mb-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={barColor} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={barColor} stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={INK} opacity={0.08} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={55} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="units" fill={`url(#${gradId})`} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/60">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead>Boutique</TableHead>
                  <TableHead className="text-right">Unités</TableHead>
                  <TableHead className="text-right">Revenus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.key} className="border-border/40">
                    <TableCell>
                      <span
                        className={cn(
                          "inline-grid h-6 w-6 place-items-center rounded-md text-[11px] font-semibold",
                          tone === "up" && i < 3
                            ? "bg-gold text-gold-foreground"
                            : "bg-secondary text-secondary-foreground",
                        )}
                      >
                        {i + 1}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div>{r.name}</div>
                      {r.category && (
                        <div className="text-xs text-muted-foreground">{r.category}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{r.shopName}</TableCell>
                    <TableCell className="text-right font-mono">{r.unitsSold}</TableCell>
                    <TableCell className="text-right font-mono">{formatFCFA(r.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Card>
  );
}

function VerdictBadge({ verdict }: { verdict: "excellent" | "bon" | "moyen" | "faible" | "aucune" }) {
  const map: Record<string, { label: string; className: string }> = {
    excellent: { label: "Excellent", className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
    bon: { label: "Bon", className: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
    moyen: { label: "Moyen", className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
    faible: { label: "Faible", className: "bg-orange-500/15 text-orange-700 border-orange-500/30" },
    aucune: { label: "Aucune vente", className: "bg-red-500/15 text-red-700 border-red-500/30" },
  };
  const v = map[verdict];
  return <Badge variant="outline" className={cn("rounded-full", v.className)}>{v.label}</Badge>;
}

/* ============ GROWTH ============ */

type GrowthStats = Awaited<ReturnType<typeof getShopsGrowth>>;

function GrowthSection({
  data,
  isLoading,
}: {
  data: GrowthStats | undefined;
  isLoading: boolean;
}) {
  if (isLoading || !data) {
    return (
      <div className="p-16 grid place-items-center">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: EMERALD_LIGHT }} />
      </div>
    );
  }
  const t = data.totals;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Boutiques totales" value={String(t.totalShops)} icon={<Store className="h-4 w-4" />} tone="emerald" />
        <StatCard label="Abonnés actifs" value={String(t.activeSubsNow)} icon={<Crown className="h-4 w-4" />} tone="gold" hint={`Conversion ${t.conversionRate.toFixed(1)}%`} />
        <StatCard label="En période d'essai" value={String(t.trialingNow)} icon={<Clock className="h-4 w-4" />} tone="neutral" />
        <StatCard label="Comptes expirés" value={String(t.expiredNow)} icon={<XCircle className="h-4 w-4" />} tone="danger" />
      </div>

      <Card className="p-5 rounded-2xl border-border/60 shadow-soft overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-emerald text-primary-foreground">
              <Store className="h-4 w-4" />
            </div>
            <div>
              <div className="font-display font-semibold">Croissance des boutiques</div>
              <div className="text-xs text-muted-foreground">12 derniers mois</div>
            </div>
          </div>
        </div>
        <div className="h-72 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.months} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="areaCumul" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={EMERALD_LIGHT} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={EMERALD_LIGHT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={INK} opacity={0.08} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="cumulativeShops" name="Boutiques (cumul)" stroke={EMERALD_LIGHT} strokeWidth={2.5} fill="url(#areaCumul)" />
              <Line type="monotone" dataKey="shopsCreated" name="Nouvelles boutiques" stroke={GOLD} strokeWidth={2.5} dot={{ r: 3, fill: GOLD }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5 rounded-2xl border-border/60 shadow-soft overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-gold text-gold-foreground">
              <Crown className="h-4 w-4" />
            </div>
            <div>
              <div className="font-display font-semibold">Croissance des abonnements</div>
              <div className="text-xs text-muted-foreground">Nouveaux vs actifs</div>
            </div>
          </div>
        </div>
        <div className="h-72 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.months} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="barNew" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="barActive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={EMERALD_LIGHT} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={EMERALD} stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={INK} opacity={0.08} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="newSubs" name="Nouveaux abonnés" fill="url(#barNew)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="activeSubs" name="Abonnés actifs" fill="url(#barActive)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5 rounded-2xl border-border/60 shadow-soft">
        <div className="text-sm font-display font-semibold mb-4">Détail mensuel</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border/60">
                <TableHead>Mois</TableHead>
                <TableHead className="text-right">Nouvelles boutiques</TableHead>
                <TableHead className="text-right">Boutiques (cumul)</TableHead>
                <TableHead className="text-right">Nouveaux abonnés</TableHead>
                <TableHead className="text-right">Abonnés actifs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data.months].reverse().map((m) => (
                <TableRow key={m.key} className="border-border/40">
                  <TableCell className="font-medium">{m.label}</TableCell>
                  <TableCell className="text-right font-mono">{m.shopsCreated}</TableCell>
                  <TableCell className="text-right font-mono">{m.cumulativeShops}</TableCell>
                  <TableCell className="text-right font-mono">{m.newSubs}</TableCell>
                  <TableCell className="text-right font-mono">{m.activeSubs}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  hint,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  hint?: React.ReactNode;
  tone: "emerald" | "gold" | "neutral" | "danger";
}) {
  const styles: Record<string, { card: string; badge: string }> = {
    emerald: {
      card: "bg-gradient-emerald text-primary-foreground border-transparent",
      badge: "bg-white/15 text-primary-foreground",
    },
    gold: {
      card: "bg-gradient-gold text-gold-foreground border-transparent",
      badge: "bg-white/25 text-gold-foreground",
    },
    neutral: {
      card: "bg-card text-card-foreground border-border/60",
      badge: "bg-secondary text-secondary-foreground",
    },
    danger: {
      card: "bg-card text-card-foreground border-destructive/30",
      badge: "bg-destructive/15 text-destructive",
    },
  };
  const s = styles[tone];
  return (
    <Card className={cn("p-4 rounded-2xl shadow-soft border", s.card)}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
          {label}
        </div>
        <div className={cn("grid h-8 w-8 place-items-center rounded-lg", s.badge)}>
          {icon}
        </div>
      </div>
      <div className="font-display text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs opacity-80 mt-1">{hint}</div>}
    </Card>
  );
}
