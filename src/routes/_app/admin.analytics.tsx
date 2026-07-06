import { useMemo, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Search,
  Package,
  TrendingUp,
  TrendingDown,
  Store,
  Crown,
  Clock,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

import { PageHeader } from "@/components/PageHeader";
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

export const Route = createFileRoute("/_app/admin/analytics")({
  component: AnalyticsPage,
});

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
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistiques"
        subtitle="Analyse des produits et croissance des boutiques"
      />

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">Produits</TabsTrigger>
          <TabsTrigger value="growth">Croissance</TabsTrigger>
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
    <div className="space-y-4">
      {/* Filters */}
      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Zone / Boutique
            </label>
            <Select value={shopId} onValueChange={setShopId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les boutiques</SelectItem>
                {shops.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Catégorie
            </label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Nombre à afficher
            </label>
            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["5", "10", "20", "50", "100"].map((n) => (
                  <SelectItem key={n} value={n}>
                    Top / Flop {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Rechercher un produit
            </label>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom du produit…"
                className="pl-8"
              />
            </div>
          </div>
        </div>
      </Card>

      {isLoading || !data ? (
        <div className="p-10 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : (
        <>
          {/* Search result */}
          {searchResult && (
            <Card className="p-4">
              <div className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Search className="h-4 w-4 text-accent" />
                Résultats de recherche ({searchResult.matches.length})
              </div>
              {searchResult.matches.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Aucun produit ne correspond à «&nbsp;{search}&nbsp;».
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
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
                      <TableRow key={m.key}>
                        <TableCell className="font-medium">{m.name}</TableCell>
                        <TableCell className="text-muted-foreground">{m.shopName}</TableCell>
                        <TableCell className="text-right font-mono">{m.unitsSold}</TableCell>
                        <TableCell className="text-right font-mono">{formatFCFA(m.revenue)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          #{m.rank} / {searchResult.total}
                        </TableCell>
                        <TableCell>
                          <VerdictBadge verdict={m.verdict} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <ProductChartCard
              title="Produits les plus vendus"
              icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
              rows={top}
              tone="up"
            />
            <ProductChartCard
              title="Produits les moins vendus"
              icon={<TrendingDown className="h-4 w-4 text-red-600" />}
              rows={bottom}
              tone="down"
            />
          </div>
        </>
      )}
    </div>
  );
}

function ProductChartCard({
  title,
  icon,
  rows,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  rows: ProductStats["items"];
  tone: "up" | "down";
}) {
  const chartData = rows.slice(0, 10).map((r) => ({
    name: r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name,
    units: r.unitsSold,
  }));
  const barColor = tone === "up" ? "hsl(var(--accent))" : "hsl(var(--destructive))";

  return (
    <Card className="p-4">
      <div className="text-sm font-semibold mb-3 flex items-center gap-2">
        {icon}
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">
          Aucun produit à afficher.
        </div>
      ) : (
        <>
          <div className="h-56 mb-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="units" fill={barColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Produit</TableHead>
                  <TableHead>Boutique</TableHead>
                  <TableHead className="text-right">Unités</TableHead>
                  <TableHead className="text-right">Revenus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.key}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
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
  return <Badge variant="outline" className={v.className}>{v.label}</Badge>;
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
      <div className="p-10 grid place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-accent" />
      </div>
    );
  }
  const t = data.totals;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Boutiques totales" value={String(t.totalShops)} icon={<Store className="h-4 w-4 text-accent" />} />
        <StatCard label="Abonnés actifs" value={String(t.activeSubsNow)} icon={<Crown className="h-4 w-4 text-emerald-600" />} hint={`Taux de conversion: ${t.conversionRate.toFixed(1)}%`} />
        <StatCard label="En période d'essai" value={String(t.trialingNow)} icon={<Clock className="h-4 w-4 text-amber-600" />} />
        <StatCard label="Comptes expirés" value={String(t.expiredNow)} icon={<XCircle className="h-4 w-4 text-red-600" />} />
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Store className="h-4 w-4 text-accent" />
          Croissance des boutiques (12 derniers mois)
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.months}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cumulativeShops" name="Boutiques (cumul)" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="shopsCreated" name="Nouvelles boutiques" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Crown className="h-4 w-4 text-emerald-600" />
          Croissance des abonnements
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.months}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="newSubs" name="Nouveaux abonnés" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="activeSubs" name="Abonnés actifs" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">Détail mensuel</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mois</TableHead>
                <TableHead className="text-right">Nouvelles boutiques</TableHead>
                <TableHead className="text-right">Boutiques (cumul)</TableHead>
                <TableHead className="text-right">Nouveaux abonnés</TableHead>
                <TableHead className="text-right">Abonnés actifs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data.months].reverse().map((m) => (
                <TableRow key={m.key}>
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
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </div>
        {icon}
      </div>
      <div className="text-2xl font-display font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </Card>
  );
}
