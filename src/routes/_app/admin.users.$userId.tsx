import { createFileRoute, Link, Navigate, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Loader2, Save, KeyRound, Trash2, Gift, ShieldAlert, ShoppingBag,
  Package, TrendingUp, Calendar, Phone, Mail, MapPin, Image as ImageIcon, UserCog,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRole } from "@/lib/role";
import { useAuth } from "@/lib/auth";
import { formatFCFA, formatDate, formatDateTime } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import {
  getOwnerDetail, adminUpdateOwner, adminResetPassword, adminChangeRole,
  adminDeleteOwner, adminExtendSubscription,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin/users/$userId")({
  component: UserDetailPage,
});

function UserDetailPage() {
  const { isAdmin, loading } = useRole();
  const { userId } = useParams({ from: "/_app/admin/users/$userId" });
  const { user: me } = useAuth();
  const qc = useQueryClient();

  const fetchDetail = useServerFn(getOwnerDetail);
  const update = useServerFn(adminUpdateOwner);
  const resetPwd = useServerFn(adminResetPassword);
  const changeRole = useServerFn(adminChangeRole);
  const del = useServerFn(adminDeleteOwner);
  const extend = useServerFn(adminExtendSubscription);

  const q = useQuery({
    queryKey: ["admin-owner", userId],
    queryFn: () => fetchDetail({ data: { userId } }),
    enabled: isAdmin,
  });

  const [form, setForm] = useState({
    ownerName: "", email: "", phone: "",
    shopName: "", quartier: "", ville: "", shopPhotoUrl: "",
  });
  const [giftDays, setGiftDays] = useState(7);
  const [delOpen, setDelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const d = q.data;
    if (!d) return;
    setForm({
      ownerName: d.profile?.owner_name ?? "",
      email: d.auth.email ?? "",
      phone: d.auth.phone ?? "",
      shopName: d.profile?.shop_name ?? d.role.shopName ?? "",
      quartier: (d.profile as { shop_quartier?: string | null } | null)?.shop_quartier ?? "",
      ville: (d.profile as { shop_ville?: string | null } | null)?.shop_ville ?? "",
      shopPhotoUrl: (d.profile as { shop_photo_url?: string | null } | null)?.shop_photo_url ?? "",
    });
  }, [q.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-owner", userId] });

  const mSave = useMutation({
    mutationFn: () => update({ data: { userId, ...form } }),
    onSuccess: () => { toast.success("Informations enregistrées"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mReset = useMutation({
    mutationFn: () => resetPwd({ data: { userId } }),
    onSuccess: async (r) => {
      if (r.link) {
        await navigator.clipboard.writeText(r.link);
        toast.success("Lien de réinitialisation copié", { description: r.email ?? undefined });
      } else {
        toast.success("Email de réinitialisation envoyé");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mRole = useMutation({
    mutationFn: (role: "owner" | "agent") => changeRole({ data: { userId, role } }),
    onSuccess: () => { toast.success("Rôle modifié"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mDelete = useMutation({
    mutationFn: () => del({ data: { userId, confirm: true } }),
    onSuccess: () => { toast.success("Compte supprimé"); window.location.href = "/admin"; },
    onError: (e: Error) => toast.error(e.message),
  });
  const mGift = useMutation({
    mutationFn: () => extend({ data: { userId, days: giftDays } }),
    onSuccess: (r) => { toast.success(`${giftDays} jours offerts`, { description: `Expire: ${formatDate(r.expiresAt)}` }); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handlePhotoUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("shop-photos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("shop-photos").getPublicUrl(path);
      setForm((f) => ({ ...f, shopPhotoUrl: pub.publicUrl }));
      toast.success("Photo téléchargée — n'oubliez pas d'enregistrer");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  if (loading || q.isLoading) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/dashboard" />;
  if (!q.data) return <div className="p-6 text-sm text-muted-foreground">Utilisateur introuvable</div>;

  const d = q.data;
  const expired = !d.profile?.subscription_expires_at || new Date(d.profile.subscription_expires_at) < new Date();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin"><ArrowLeft className="h-4 w-4" /> Retour</Link>
        </Button>
      </div>

      <PageHeader
        title={d.profile?.owner_name ?? d.auth.email ?? "Boutiquier"}
        subtitle={d.role.shopName ?? "Boutique"}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Ventes" value={d.stats.salesCount} icon={<ShoppingBag className="h-4 w-4" />} />
        <StatCard label="Chiffre d'affaires" value={formatFCFA(d.stats.revenue)} icon={<TrendingUp className="h-4 w-4 text-emerald-600" />} />
        <StatCard label="Produits" value={d.stats.productsCount} icon={<Package className="h-4 w-4" />} />
        <StatCard label="Stock total" value={d.stats.stockTotal} icon={<Package className="h-4 w-4 text-accent" />} />
        <StatCard label="Valeur stock" value={formatFCFA(d.stats.stockValue)} icon={<TrendingUp className="h-4 w-4 text-amber-600" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Informations personnelles */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserCog className="h-4 w-4 text-accent" />
            <h3 className="font-semibold">Informations personnelles</h3>
          </div>

          <Field label="Nom du propriétaire" icon={<UserCog className="h-3.5 w-3.5" />}>
            <Input value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
          </Field>
          <Field label="Email" icon={<Mail className="h-3.5 w-3.5" />}>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Téléphone" icon={<Phone className="h-3.5 w-3.5" />}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+221..." />
          </Field>

          <div className="border-t pt-4 space-y-4">
            <h4 className="text-sm font-medium text-muted-foreground">Boutique</h4>
            <Field label="Nom de la boutique" icon={<ShoppingBag className="h-3.5 w-3.5" />}>
              <Input value={form.shopName} onChange={(e) => setForm({ ...form, shopName: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quartier" icon={<MapPin className="h-3.5 w-3.5" />}>
                <Input value={form.quartier} onChange={(e) => setForm({ ...form, quartier: e.target.value })} />
              </Field>
              <Field label="Ville" icon={<MapPin className="h-3.5 w-3.5" />}>
                <Input value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} />
              </Field>
            </div>

            <Field label="Photo de la boutique" icon={<ImageIcon className="h-3.5 w-3.5" />}>
              <div className="flex items-center gap-3">
                {form.shopPhotoUrl ? (
                  <img src={form.shopPhotoUrl} alt="" className="h-14 w-14 rounded-md object-cover border" />
                ) : (
                  <div className="h-14 w-14 rounded-md border border-dashed grid place-items-center text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                <Input type="file" accept="image/*" disabled={uploading}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />
              </div>
            </Field>
          </div>

          <div className="text-xs text-muted-foreground border-t pt-3 flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            Compte créé : {d.auth.createdAt ? formatDateTime(d.auth.createdAt) : "—"}
          </div>

          <Button onClick={() => mSave.mutate()} disabled={mSave.isPending} className="w-full">
            {mSave.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer les modifications
          </Button>
        </Card>

        {/* Gestion du compte */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-accent" />
            <h3 className="font-semibold">Gestion du compte</h3>
          </div>

          <div className="text-sm space-y-1">
            <div className="text-muted-foreground text-xs">Dernière connexion</div>
            <div className="font-medium">
              {d.auth.lastSignInAt ? formatDateTime(d.auth.lastSignInAt) : "Jamais"}
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Rôle actuel</Label>
            <div className="flex items-center gap-2">
              <Select value={d.role.role ?? "owner"} onValueChange={(v) => mRole.mutate(v as "owner" | "agent")}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Propriétaire</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
              {mRole.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <Button variant="outline" onClick={() => mReset.mutate()} disabled={mReset.isPending} className="w-full">
              {mReset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Réinitialiser le mot de passe
            </Button>
            <p className="text-xs text-muted-foreground">
              Un lien de réinitialisation sera généré et copié dans votre presse-papier.
            </p>
          </div>

          <div className="border-t pt-4">
            <Button
              variant="destructive"
              onClick={() => setDelOpen(true)}
              disabled={me?.id === userId}
              className="w-full"
            >
              <Trash2 className="h-4 w-4" /> Supprimer définitivement
            </Button>
            {me?.id === userId && (
              <p className="text-xs text-muted-foreground mt-2">Vous ne pouvez pas supprimer votre propre compte.</p>
            )}
          </div>
        </Card>

        {/* Abonnement */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-accent" />
            <h3 className="font-semibold">Abonnement</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Statut</div>
              <div className="font-medium">
                {expired ? <Badge variant="destructive">Expiré</Badge> : <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">Actif</Badge>}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Plan</div>
              <div className="font-medium capitalize">{d.profile?.subscription_status ?? "free"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Prochaine facturation</div>
              <div className="font-medium">
                {d.profile?.subscription_expires_at ? formatDate(d.profile.subscription_expires_at) : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Fin d'essai</div>
              <div className="font-medium">
                {d.profile?.trial_ends_at ? formatDate(d.profile.trial_ends_at) : "—"}
              </div>
            </div>
          </div>

          <div className="border-t pt-4 space-y-2">
            <Label className="text-xs text-muted-foreground">Offrir des jours gratuits</Label>
            <div className="flex gap-2">
              <Input type="number" min={1} max={365} value={giftDays}
                onChange={(e) => setGiftDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-24" />
              <Button onClick={() => mGift.mutate()} disabled={mGift.isPending} className="flex-1">
                {mGift.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
                Offrir {giftDays} jours
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="text-xs text-muted-foreground mb-2">Historique des paiements</div>
            {d.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p>
            ) : (
              <div className="max-h-56 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Montant</TableHead>
                      <TableHead>Méthode</TableHead>
                      <TableHead>Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-xs">{formatDate(p.paid_at ?? p.created_at)}</TableCell>
                        <TableCell>{formatFCFA(Number(p.amount))}</TableCell>
                        <TableCell className="text-xs">{p.payment_method ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Card>

        {/* Produits */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-accent" />
            <h3 className="font-semibold">Produits ({d.products.length})</h3>
          </div>
          {d.products.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun produit.</p>
          ) : (
            <div className="max-h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Prix</TableHead>
                    <TableHead>Catégorie</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.products.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-sm">{p.name}</TableCell>
                      <TableCell>
                        <Badge variant={p.stock <= 5 ? "destructive" : "secondary"}>{p.stock}</Badge>
                      </TableCell>
                      <TableCell>{formatFCFA(Number(p.price))}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.category ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce compte définitivement ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est <strong>irréversible</strong>. Toutes les données associées (boutique, produits,
              ventes, dépenses, dettes, paiements) seront supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => mDelete.mutate()}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}{label}
      </Label>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-1 text-lg font-display font-semibold truncate">{value}</div>
    </Card>
  );
}
