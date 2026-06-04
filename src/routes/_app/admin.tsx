import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search, Loader2, Users, BadgeCheck, Wallet, Clock, Power, PowerOff, CalendarPlus,
  Link as LinkIcon, MessageCircle, RotateCcw, Copy, ShieldCheck,
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
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/lib/role";
import { formatFCFA, formatDate, formatDateTime } from "@/lib/format";
import {
  getAdminStats, listShopOwners,
  adminActivateSubscription, adminDeactivateSubscription, adminExtendSubscription,
  adminGeneratePaymentLink,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
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

function AdminPage() {
  const { isAdmin, loading } = useRole();
  const qc = useQueryClient();

  const fetchStats = useServerFn(getAdminStats);
  const fetchOwners = useServerFn(listShopOwners);
  const activate = useServerFn(adminActivateSubscription);
  const deactivate = useServerFn(adminDeactivateSubscription);
  const extend = useServerFn(adminExtendSubscription);
  const genLink = useServerFn(adminGeneratePaymentLink);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [relanceOpen, setRelanceOpen] = useState(false);

  const statsQ = useQuery({ queryKey: ["admin-stats"], queryFn: () => fetchStats(), enabled: isAdmin });
  const ownersQ = useQuery({ queryKey: ["admin-owners"], queryFn: () => fetchOwners(), enabled: isAdmin });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-owners"] });
  };

  const mActivate = useMutation({
    mutationFn: (userId: string) => activate({ data: { userId, plan: "monthly" } }),
    onSuccess: () => { toast.success("Compte activé pour 30 jours"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDeactivate = useMutation({
    mutationFn: (userId: string) => deactivate({ data: { userId } }),
    onSuccess: () => { toast.success("Compte désactivé"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mExtend = useMutation({
    mutationFn: (userId: string) => extend({ data: { userId, days: 30 } }),
    onSuccess: () => { toast.success("+30 jours ajoutés"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleLink = async (userId: string) => {
    try {
      const { url } = await genLink({ data: { userId } });
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié", { description: url });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleWhatsapp = (phone: string | null) => {
    if (!phone) return toast.error("Aucun numéro de téléphone enregistré");
    const clean = phone.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${clean}`, "_blank");
  };

  const filtered = useMemo(() => {
    const rows = ownersQ.data ?? [];
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const s = statusOf(r);
      if (filter !== "all" && s !== filter) return false;
      if (!q) return true;
      return (
        (r.ownerName ?? "").toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.shopName ?? "").toLowerCase().includes(q)
      );
    });
  }, [ownersQ.data, search, filter]);

  const expiredList = useMemo(
    () => (ownersQ.data ?? []).filter((r) => statusOf(r) === "expired" && r.phone),
    [ownersQ.data],
  );
  const relanceMessage = useMemo(() => {
    const numbers = expiredList.map((r) => `- ${r.ownerName ?? r.email ?? "Boutiquier"} : ${r.phone}`).join("\n");
    return `Bonjour 👋\n\nVotre abonnement Teranga est expiré. Renouvelez dès maintenant pour 15 000 FCFA et continuez à gérer votre boutique sans interruption.\n\nLien Wave : https://pay.wave.com/m/M_sn_hCGRH3TAuixY/c/sn/?amount=15000\n\nBoutiquiers concernés :\n${numbers}`;
  }, [expiredList]);

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
        title="Administration"
        description="Gestion totale de la plateforme Teranga"
        icon={<ShieldCheck className="h-5 w-5" />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Boutiquiers inscrits" value={s?.totalOwners ?? "—"} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Abonnés actifs" value={s?.activeSubs ?? "—"} icon={<BadgeCheck className="h-4 w-4 text-emerald-600" />} />
        <StatCard label="CA du mois" value={s ? formatFCFA(s.monthlyRevenue) : "—"} icon={<Wallet className="h-4 w-4 text-accent" />} />
        <StatCard label="Expirent < 7 jours" value={s?.expiringSoon ?? "—"} icon={<Clock className="h-4 w-4 text-amber-600" />} />
      </div>

      {/* Filters */}
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
            <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setFilter("all"); }}>
              Réinitialiser
            </Button>
          </div>
          <Button onClick={() => setRelanceOpen(true)} variant="secondary" className="md:ml-auto">
            <RotateCcw className="h-4 w-4" /> Relancer les expirés ({expiredList.length})
          </Button>
        </div>
      </Card>

      {/* Table */}
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
                <TableHead>Téléphone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Fin d'abonnement</TableHead>
                <TableHead>Dernière connexion</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => {
                const st = statusOf(r);
                return (
                  <TableRow key={r.userId}>
                    <TableCell>
                      <div className="font-medium">{r.ownerName ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.shopName ?? ""}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.phone ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.email ?? "—"}</TableCell>
                    <TableCell><StatusBadge s={st} /></TableCell>
                    <TableCell className="text-xs">
                      {r.subscriptionExpiresAt ? formatDate(r.subscriptionExpiresAt) : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.lastSignInAt ? formatDateTime(r.lastSignInAt) : "Jamais"}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button size="sm" variant="outline"
                          onClick={() => mActivate.mutate(r.userId)}
                          disabled={mActivate.isPending}>
                          <Power className="h-3.5 w-3.5" /> Activer
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => mDeactivate.mutate(r.userId)}
                          disabled={mDeactivate.isPending}>
                          <PowerOff className="h-3.5 w-3.5" /> Désactiver
                        </Button>
                        <Button size="sm" variant="outline"
                          onClick={() => mExtend.mutate(r.userId)}
                          disabled={mExtend.isPending}>
                          <CalendarPlus className="h-3.5 w-3.5" /> +30 j
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleLink(r.userId)}>
                          <LinkIcon className="h-3.5 w-3.5" /> Lien
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleWhatsapp(r.phone)}>
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
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

      {/* Relance dialog */}
      <Dialog open={relanceOpen} onOpenChange={setRelanceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Relancer les abonnements expirés</DialogTitle>
            <DialogDescription>
              {expiredList.length} boutiquier(s) à relancer. Copiez le message ci-dessous et envoyez-le par WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <Textarea value={relanceMessage} readOnly className="min-h-[260px] font-mono text-xs" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRelanceOpen(false)}>Fermer</Button>
            <Button onClick={async () => {
              await navigator.clipboard.writeText(relanceMessage);
              toast.success("Message copié dans le presse-papier");
            }}>
              <Copy className="h-4 w-4" /> Copier le message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
