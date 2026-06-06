import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, Settings2, Filter } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useRole } from "@/lib/role";
import { formatFCFA, formatDate, formatDateTime } from "@/lib/format";
import { listShopOwners } from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin/users/")({
  component: AdminUsersPage,
});

type StatusFilter = "all" | "active" | "expired" | "free";

function statusOf(row: { subscriptionStatus: string; subscriptionExpiresAt: string | null }) {
  const exp = row.subscriptionExpiresAt ? new Date(row.subscriptionExpiresAt) : null;
  if (row.subscriptionStatus === "free") return "free" as const;
  if (exp && exp > new Date()) return "active" as const;
  return "expired" as const;
}

function StatusBadge({ s }: { s: "active" | "expired" | "free" }) {
  if (s === "active")
    return <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15">● Actif</Badge>;
  if (s === "expired")
    return <Badge className="bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/15">● Expiré</Badge>;
  return <Badge className="bg-muted text-muted-foreground border border-border hover:bg-muted">● Gratuit</Badge>;
}

function AdminUsersPage() {
  const { isAdmin, loading } = useRole();
  const fetchOwners = useServerFn(listShopOwners);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [advOpen, setAdvOpen] = useState(false);
  const [fVille, setFVille] = useState("");
  const [fInactiveDays, setFInactiveDays] = useState<number | "">("");
  const [fMaxStock, setFMaxStock] = useState<number | "">("");
  const [fMinRevenue, setFMinRevenue] = useState<number | "">("");

  const ownersQ = useQuery({ queryKey: ["admin-owners"], queryFn: () => fetchOwners(), enabled: isAdmin });

  const filtered = useMemo(() => {
    const rows = ownersQ.data ?? [];
    const q = search.trim().toLowerCase();
    const villeQ = fVille.trim().toLowerCase();
    const now = Date.now();
    return rows.filter((r) => {
      const s = statusOf(r);
      if (filter !== "all" && s !== filter) return false;
      if (q) {
        const match =
          (r.ownerName ?? "").toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q) ||
          (r.phone ?? "").toLowerCase().includes(q) ||
          (r.shopName ?? "").toLowerCase().includes(q);
        if (!match) return false;
      }
      if (villeQ) {
        const v = `${r.ville ?? ""} ${r.quartier ?? ""}`.toLowerCase();
        if (!v.includes(villeQ)) return false;
      }
      if (fInactiveDays !== "" && Number(fInactiveDays) > 0) {
        const last = r.lastSignInAt ? new Date(r.lastSignInAt).getTime() : 0;
        const daysSince = last ? (now - last) / (24 * 3600 * 1000) : Infinity;
        if (daysSince < Number(fInactiveDays)) return false;
      }
      if (fMaxStock !== "" && Number(fMaxStock) >= 0) {
        if ((r.productsCount ?? 0) > Number(fMaxStock)) return false;
      }
      if (fMinRevenue !== "" && Number(fMinRevenue) > 0) {
        if ((r.revenue ?? 0) < Number(fMinRevenue)) return false;
      }
      return true;
    });
  }, [ownersQ.data, search, filter, fVille, fInactiveDays, fMaxStock, fMinRevenue]);

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
        title="Gestion des users"
        subtitle="Gérer les comptes, abonnements et informations des boutiquiers"
      />

      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher (nom, email, téléphone)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {([
              { v: "all", l: "Tous" },
              { v: "active", l: "Actifs" },
              { v: "expired", l: "Expirés" },
              { v: "free", l: "Gratuits" },
            ] as const).map((o) => (
              <Button
                key={o.v}
                size="sm"
                variant={filter === o.v ? "default" : "outline"}
                onClick={() => setFilter(o.v)}
              >
                {o.l}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => {
              setSearch(""); setFilter("all"); setFVille("");
              setFInactiveDays(""); setFMaxStock(""); setFMinRevenue("");
            }}>
              Réinitialiser
            </Button>
            <Button size="sm" variant={advOpen ? "default" : "outline"} onClick={() => setAdvOpen((o) => !o)}>
              <Filter className="h-3.5 w-3.5" /> Filtres avancés
            </Button>
          </div>
        </div>

        {advOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Quartier / Ville</label>
              <Input value={fVille} onChange={(e) => setFVille(e.target.value)} placeholder="Ex: Dakar" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Inactifs depuis (jours)</label>
              <Input type="number" min={0} value={fInactiveDays}
                onChange={(e) => setFInactiveDays(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="7, 30, 90..." />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Stock faible (≤ N produits)</label>
              <Input type="number" min={0} value={fMaxStock}
                onChange={(e) => setFMaxStock(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="10" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">CA minimum (FCFA)</label>
              <Input type="number" min={0} value={fMinRevenue}
                onChange={(e) => setFMinRevenue(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="500000" />
            </div>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        {ownersQ.isLoading ? (
          <div className="p-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Aucun boutiquier trouvé</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Boutique</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Fin abonnement</TableHead>
                <TableHead>Dernière connexion</TableHead>
                <TableHead className="text-right">CA</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const st = statusOf(r);
                return (
                  <TableRow key={r.userId}>
                    <TableCell className="font-medium">{r.ownerName ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.shopName ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.phone ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.email ?? "—"}</TableCell>
                    <TableCell><StatusBadge s={st} /></TableCell>
                    <TableCell className="text-xs">
                      {r.subscriptionExpiresAt ? formatDate(r.subscriptionExpiresAt) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.lastSignInAt ? formatDateTime(r.lastSignInAt) : "Jamais"}
                    </TableCell>
                    <TableCell className="text-right text-xs">{formatFCFA(r.revenue ?? 0)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button size="sm" asChild>
                          <Link to="/admin/users/$userId" params={{ userId: r.userId }}>
                            <Settings2 className="h-3.5 w-3.5" /> Gérer
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
