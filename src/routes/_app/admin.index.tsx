import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search, Loader2, Users, BadgeCheck, Wallet, Clock,
  Power, PowerOff, CalendarPlus, MessageCircle, Trash2, Info,
} from "lucide-react";

import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRole } from "@/lib/role";
import { formatFCFA, formatDate, formatDateTime } from "@/lib/format";
import {
  getAdminStats, listShopOwners,
  adminActivateSubscription, adminDeactivateSubscription, adminExtendSubscription,
  adminDeleteOwner,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin/")({
  component: AdminPage,
});

type Owner = Awaited<ReturnType<typeof listShopOwners>>[number];

function isActive(row: Owner) {
  const exp = row.subscriptionExpiresAt ? new Date(row.subscriptionExpiresAt) : null;
  return row.subscriptionStatus !== "free" && !!exp && exp > new Date();
}

function AdminPage() {
  const { isAdmin, loading } = useRole();
  const qc = useQueryClient();

  const fetchStats = useServerFn(getAdminStats);
  const fetchOwners = useServerFn(listShopOwners);
  const activate = useServerFn(adminActivateSubscription);
  const deactivate = useServerFn(adminDeactivateSubscription);
  const extend = useServerFn(adminExtendSubscription);
  const del = useServerFn(adminDeleteOwner);

  const [search, setSearch] = useState("");
  const [detailRow, setDetailRow] = useState<Owner | null>(null);
  const [extendRow, setExtendRow] = useState<Owner | null>(null);
  const [extendDays, setExtendDays] = useState<number | "">(30);
  const [deleteRow, setDeleteRow] = useState<Owner | null>(null);

  const statsQ = useQuery({ queryKey: ["admin-stats"], queryFn: () => fetchStats(), enabled: isAdmin });
  const ownersQ = useQuery({ queryKey: ["admin-owners"], queryFn: () => fetchOwners(), enabled: isAdmin });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-owners"] });
  };

  const mActivate = useMutation({
    mutationFn: (userId: string) => activate({ data: { userId, plan: "monthly" } }),
    onSuccess: () => { toast.success("Abonnement activé (30 jours)"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDeactivate = useMutation({
    mutationFn: (userId: string) => deactivate({ data: { userId } }),
    onSuccess: () => { toast.success("Abonnement désactivé"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mExtend = useMutation({
    mutationFn: ({ userId, days }: { userId: string; days: number }) =>
      extend({ data: { userId, days } }),
    onSuccess: () => { toast.success("Jours ajoutés"); invalidate(); setExtendRow(null); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDelete = useMutation({
    mutationFn: (userId: string) => del({ data: { userId, confirm: true } }),
    onSuccess: () => { toast.success("Boutique supprimée"); invalidate(); setDeleteRow(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleWhatsapp = (phone: string | null) => {
    if (!phone) return toast.error("Aucun numéro enregistré");
    const clean = phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${clean}`, "_blank");
  };

  const filtered = useMemo(() => {
    const rows = ownersQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.shopName ?? "").toLowerCase().includes(q) ||
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.ownerName ?? "").toLowerCase().includes(q) ||
      (r.phone ?? "").toLowerCase().includes(q),
    );
  }, [ownersQ.data, search]);

  if (loading) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" />;

  const s = statsQ.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des boutiques"
        subtitle="Toutes les boutiques inscrites sur Teranga"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Boutiques" value={s?.totalOwners ?? "—"} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Abonnements actifs" value={s?.activeSubs ?? "—"} icon={<BadgeCheck className="h-4 w-4 text-emerald-600" />} />
        <StatCard label="CA du mois" value={s ? formatFCFA(s.monthlyRevenue) : "—"} icon={<Wallet className="h-4 w-4 text-accent" />} />
        <StatCard label="Expirent < 7 jours" value={s?.expiringSoon ?? "—"} icon={<Clock className="h-4 w-4 text-amber-600" />} />
      </div>

      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher (boutique, email, propriétaire, téléphone)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {ownersQ.isLoading ? (
          <div className="p-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Aucune boutique trouvée</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Boutique</TableHead>
                <TableHead>Email propriétaire</TableHead>
                <TableHead>Abonnement</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const active = isActive(r);
                return (
                  <TableRow key={r.userId}>
                    <TableCell>
                      <div className="font-medium">{r.shopName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.ownerName ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-xs">{r.email ?? "—"}</TableCell>
                    <TableCell>
                      {active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/15">Premium</Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground border border-border hover:bg-muted">Gratuite</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1 flex-wrap">
                        {active ? (
                          <Button
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => mDeactivate.mutate(r.userId)}
                            disabled={mDeactivate.isPending}
                            title="Désactiver l'abonnement"
                          >
                            <PowerOff className="h-3.5 w-3.5" /> Désactiver
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => mActivate.mutate(r.userId)}
                            disabled={mActivate.isPending}
                            title="Activer l'abonnement"
                          >
                            <Power className="h-3.5 w-3.5" /> Activer
                          </Button>
                        )}
                        <Button size="sm" variant="outline"
                          onClick={() => { setExtendRow(r); setExtendDays(30); }}>
                          <CalendarPlus className="h-3.5 w-3.5" /> + Jours
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => handleWhatsapp(r.phone)}>
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => setDetailRow(r)}>
                          <Info className="h-3.5 w-3.5" /> Détail
                        </Button>
                        <Button size="sm" variant="destructive"
                          onClick={() => setDeleteRow(r)}>
                          <Trash2 className="h-3.5 w-3.5" /> Supprimer
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

      {/* Detail dialog */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails de la boutique</DialogTitle>
            <DialogDescription>Informations complètes</DialogDescription>
          </DialogHeader>
          {detailRow && (
            <div className="space-y-2 text-sm">
              <DetailLine label="Nom de la boutique" value={detailRow.shopName ?? "—"} />
              <DetailLine label="Propriétaire" value={detailRow.ownerName ?? "—"} />
              <DetailLine label="Téléphone" value={detailRow.phone ?? "—"} />
              <DetailLine label="Email" value={detailRow.email ?? "—"} />
              <DetailLine
                label="Coordonnées"
                value={[detailRow.quartier, detailRow.ville].filter(Boolean).join(", ") || "—"}
              />
              <DetailLine
                label="Date de création"
                value={detailRow.createdAt ? formatDate(detailRow.createdAt) : "—"}
              />
              <DetailLine
                label="Abonnement"
                value={isActive(detailRow) ? "Premium" : "Gratuite"}
              />
              <DetailLine
                label="Début d'abonnement"
                value={
                  isActive(detailRow) && detailRow.subscriptionExpiresAt
                    ? formatDate(new Date(new Date(detailRow.subscriptionExpiresAt).getTime() - 30 * 24 * 3600 * 1000))
                    : "—"
                }
              />
              <DetailLine
                label="Fin d'abonnement"
                value={detailRow.subscriptionExpiresAt ? formatDate(detailRow.subscriptionExpiresAt) : "—"}
              />
              <DetailLine
                label="Dernière connexion"
                value={detailRow.lastSignInAt ? formatDateTime(detailRow.lastSignInAt) : "Jamais"}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailRow(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend days dialog */}
      <Dialog open={!!extendRow} onOpenChange={(o) => !o && setExtendRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter des jours d'abonnement</DialogTitle>
            <DialogDescription>{extendRow?.shopName ?? ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Nombre de jours à ajouter</label>
            <Input
              type="number"
              min={1}
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendRow(null)}>Annuler</Button>
            <Button
              disabled={mExtend.isPending || !extendDays || Number(extendDays) < 1}
              onClick={() => extendRow && mExtend.mutate({ userId: extendRow.userId, days: Number(extendDays) })}
            >
              {mExtend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement cette boutique ?</AlertDialogTitle>
            <AlertDialogDescription>
              La boutique <strong>{deleteRow?.shopName}</strong> et toutes ses données
              (ventes, produits, dépenses, dettes, paiements, agents) seront supprimées
              de manière irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={mDelete.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteRow) mDelete.mutate(deleteRow.userId);
              }}
            >
              {mDelete.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-display font-semibold">{value}</div>
    </Card>
  );
}

function DetailLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/50 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
