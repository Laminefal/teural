import { Suspense, lazy } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, TrendingUp, TrendingDown, Wallet, Calendar, CreditCard, ReceiptText } from "lucide-react";
const RevenueMonthlyChart = lazy(() => import("@/components/charts/RevenueMonthlyChart"));

import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRole } from "@/lib/role";
import { formatFCFA, formatDateTime } from "@/lib/format";
import { getRevenueStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin/revenue")({
  component: RevenuePage,
});

function RevenuePage() {
  const { isAdmin, loading } = useRole();
  const fetchStats = useServerFn(getRevenueStats);
  const q = useQuery({
    queryKey: ["admin-revenue"],
    queryFn: () => fetchStats(),
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

  const s = q.data;
  const delta = s ? s.monthRevenue - s.prevMonthRevenue : 0;
  const deltaPct = s && s.prevMonthRevenue > 0 ? (delta / s.prevMonthRevenue) * 100 : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Revenus" subtitle="Statistiques des paiements d'abonnements" />

      {q.isLoading || !s ? (
        <div className="p-10 grid place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-accent" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Revenus totaux" value={formatFCFA(s.totalRevenue)} icon={<Wallet className="h-4 w-4 text-accent" />} />
            <StatCard
              label="Ce mois-ci"
              value={formatFCFA(s.monthRevenue)}
              icon={<Calendar className="h-4 w-4 text-emerald-600" />}
              hint={
                deltaPct === null ? undefined : (
                  <span className={delta >= 0 ? "text-emerald-600" : "text-red-600"}>
                    {delta >= 0 ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}{" "}
                    {deltaPct.toFixed(0)}% vs mois précédent
                  </span>
                )
              }
            />
            <StatCard label="Année en cours" value={formatFCFA(s.yearRevenue)} icon={<TrendingUp className="h-4 w-4 text-accent" />} />
            <StatCard label="Paiements confirmés" value={s.paidCount} icon={<ReceiptText className="h-4 w-4" />} hint={`${s.pendingCount} en attente`} />
          </div>

          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">Revenus mensuels — 12 derniers mois</h2>
            </div>
            <div className="h-72">
              <Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-muted/50" />}>
                <RevenueMonthlyChart data={s.monthly} />
              </Suspense>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-accent" /> Par plan
              </h3>
              {s.byPlan.length === 0 ? (
                <div className="text-sm text-muted-foreground">Aucun paiement</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead className="text-right">Paiements</TableHead>
                      <TableHead className="text-right">Revenus</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.byPlan.map((r) => (
                      <TableRow key={r.plan}>
                        <TableCell className="capitalize">{r.plan}</TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                        <TableCell className="text-right font-medium">{formatFCFA(r.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-accent" /> Par moyen de paiement
              </h3>
              {s.byMethod.length === 0 ? (
                <div className="text-sm text-muted-foreground">Aucun paiement</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Moyen</TableHead>
                      <TableHead className="text-right">Paiements</TableHead>
                      <TableHead className="text-right">Revenus</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.byMethod.map((r) => (
                      <TableRow key={r.method}>
                        <TableCell className="capitalize">{r.method}</TableCell>
                        <TableCell className="text-right">{r.count}</TableCell>
                        <TableCell className="text-right font-medium">{formatFCFA(r.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="p-4 border-b border-border/60">
              <h3 className="font-semibold">Derniers paiements</h3>
            </div>
            {s.recent.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Aucun paiement enregistré</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Boutique</TableHead>
                    <TableHead>Propriétaire</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.recent.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs">{formatDateTime(p.paidAt)}</TableCell>
                      <TableCell className="font-medium">{p.shopName}</TableCell>
                      <TableCell className="text-xs">{p.ownerName}</TableCell>
                      <TableCell className="capitalize">{p.plan}</TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15 capitalize">
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatFCFA(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  label, value, icon, hint,
}: { label: string; value: string | number; icon: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-display font-bold">{value}</div>
      {hint && <div className="mt-1 text-xs">{hint}</div>}
    </Card>
  );
}
