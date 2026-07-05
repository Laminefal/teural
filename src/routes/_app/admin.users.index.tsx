import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search, Loader2, ChevronDown, ChevronRight, Pencil, Store, User, Users, Save,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/lib/role";
import { listShopsWithMembers, adminUpdateOwner, adminSetPassword } from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin/users/")({
  component: AdminUsersPage,
});

type Member = {
  userId: string;
  role: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type EditState = {
  userId: string;
  isOwner: boolean;
  shopId: string;
  shopName: string;
  name: string;
  email: string;
  phone: string;
  password: string;
};

function AdminUsersPage() {
  const { isAdmin, loading } = useRole();
  const fetchShops = useServerFn(listShopsWithMembers);
  const updateFn = useServerFn(adminUpdateOwner);
  const setPasswordFn = useServerFn(adminSetPassword);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [openShop, setOpenShop] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);

  const shopsQ = useQuery({
    queryKey: ["admin-shops-members"],
    queryFn: () => fetchShops(),
    enabled: isAdmin,
  });

  const updateMut = useMutation({
    mutationFn: async (v: EditState) => {
      await updateFn({
        data: {
          userId: v.userId,
          ownerName: v.name || undefined,
          email: v.email || undefined,
          phone: v.phone || undefined,
          shopName: v.isOwner ? v.shopName || undefined : undefined,
        },
      });
      if (v.password && v.password.length >= 6) {
        await setPasswordFn({ data: { userId: v.userId, password: v.password } });
      }
    },
    onSuccess: () => {
      toast.success("Informations mises à jour");
      qc.invalidateQueries({ queryKey: ["admin-shops-members"] });
      setEdit(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const rows = shopsQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) => {
      if ((s.name ?? "").toLowerCase().includes(q)) return true;
      return (s.members as Member[]).some(
        (m) =>
          (m.name ?? "").toLowerCase().includes(q) ||
          (m.email ?? "").toLowerCase().includes(q) ||
          (m.phone ?? "").toLowerCase().includes(q),
      );
    });
  }, [shopsQ.data, search]);

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
        subtitle="Boutiques, propriétaires et agents"
      />

      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher une boutique, un propriétaire ou un agent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      {shopsQ.isLoading ? (
        <div className="p-10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin text-accent" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Aucune boutique</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const members = s.members as Member[];
            const owner = members.find((m) => m.role === "owner");
            const agents = members.filter((m) => m.role !== "owner");
            const open = openShop === s.id;
            return (
              <Card key={s.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenShop(open ? null : s.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors text-left"
                >
                  {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <Store className="h-5 w-5 text-accent" />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{s.name ?? "Boutique sans nom"}</div>
                    <div className="text-xs text-muted-foreground">
                      {owner?.name ?? owner?.email ?? "—"} · {agents.length} agent{agents.length > 1 ? "s" : ""}
                    </div>
                  </div>
                  <Badge variant="outline" className="hidden sm:inline-flex">{members.length} membre{members.length > 1 ? "s" : ""}</Badge>
                </button>

                {open && (
                  <div className="border-t divide-y">
                    {owner && (
                      <MemberRow
                        member={owner}
                        icon={<User className="h-4 w-4 text-emerald-600" />}
                        label="Propriétaire"
                        onEdit={() =>
                          setEdit({
                            userId: owner.userId,
                            isOwner: true,
                            shopId: s.id,
                            shopName: s.name ?? "",
                            name: owner.name ?? "",
                            email: owner.email ?? "",
                            phone: owner.phone ?? "",
                            password: "",
                          })
                        }
                      />
                    )}
                    {agents.length === 0 ? (
                      <div className="p-4 text-xs text-muted-foreground flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" /> Aucun agent
                      </div>
                    ) : (
                      agents.map((a) => (
                        <MemberRow
                          key={a.userId}
                          member={a}
                          icon={<Users className="h-4 w-4 text-muted-foreground" />}
                          label="Agent"
                          onEdit={() =>
                            setEdit({
                              userId: a.userId,
                              isOwner: false,
                              shopId: s.id,
                              shopName: s.name ?? "",
                              name: a.name ?? "",
                              email: a.email ?? "",
                              phone: a.phone ?? "",
                              password: "",
                            })
                          }
                        />
                      ))
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier {edit?.isOwner ? "le propriétaire" : "l'agent"}</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              {edit.isOwner && (
                <div className="space-y-1.5">
                  <Label>Nom de la boutique</Label>
                  <Input value={edit.shopName} onChange={(e) => setEdit({ ...edit, shopName: e.target.value })} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Nom complet</Label>
                <Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Téléphone</Label>
                <Input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nouveau mot de passe</Label>
                <Input
                  type="text"
                  autoComplete="new-password"
                  placeholder="Laisser vide pour ne pas changer (min. 6 caractères)"
                  value={edit.password}
                  onChange={(e) => setEdit({ ...edit, password: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Renseignez uniquement si vous voulez le remplacer.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Annuler</Button>
            <Button onClick={() => edit && updateMut.mutate(edit)} disabled={updateMut.isPending}>
              {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MemberRow({
  member, icon, label, onEdit,
}: { member: Member; icon: React.ReactNode; label: string; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="h-8 w-8 rounded-full bg-muted grid place-items-center shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{member.name ?? "—"}</span>
          <Badge variant="outline" className="text-[10px]">{label}</Badge>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {member.email ?? "—"}{member.phone ? ` · ${member.phone}` : ""}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" /> Modifier
      </Button>
    </div>
  );
}
