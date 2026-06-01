import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Users, Loader2, Pencil } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRole } from "@/lib/role";
import { listAgents, createAgent, updateAgent, deleteAgent } from "@/lib/agents.functions";

export const Route = createFileRoute("/_app/agents")({
  component: AgentsPage,
});

type Agent = { id: string; email: string; name: string | null; role: string; created_at: string };

function AgentsPage() {
  const { isOwner, loading } = useRole();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);

  const { data, isLoading } = useQuery({
    enabled: isOwner,
    queryKey: ["agents"],
    queryFn: async () => await listAgents(),
  });

  const create = useMutation({
    mutationFn: async (vars: { email: string; password: string; name: string }) =>
      await createAgent({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      setOpen(false);
      toast.success("Agent créé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (vars: { agent_id: string; name?: string; email?: string; password?: string }) =>
      await updateAgent({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      setEditing(null);
      toast.success("Agent modifié");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (agent_id: string) => await deleteAgent({ data: { agent_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents"] });
      toast.success("Agent retiré");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-accent" /></div>;
  }
  if (!isOwner) return <Navigate to="/dashboard" />;

  const onCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({
      email: String(fd.get("email") || "").trim(),
      password: String(fd.get("password") || ""),
      name: String(fd.get("name") || "").trim(),
    });
  };

  const onEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");
    update.mutate({
      agent_id: editing.id,
      name: name || undefined,
      email: email && email !== editing.email ? email : undefined,
      password: password || undefined,
    });
  };

  const agents = (data?.agents ?? []).filter((a) => a.role === "agent");

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle="Gérez les vendeurs de votre boutique"
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-emerald text-primary-foreground"><Plus className="h-4 w-4" /> Nouvel agent</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Créer un agent</DialogTitle></DialogHeader>
              <form onSubmit={onCreate} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Nom complet</Label>
                  <Input id="name" name="name" required placeholder="Ex: Mamadou Sow" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required placeholder="agent@exemple.sn" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input id="password" name="password" type="password" required minLength={6} placeholder="Min. 6 caractères" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending}>
                    {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Créer
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nom</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Ajouté le</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Chargement...</td></tr>}
              {!isLoading && agents.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                  <Users className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  Aucun agent. Créez-en un pour qu'il puisse vendre dans votre boutique.
                </td></tr>
              )}
              {agents.map((a) => (
                <tr key={a.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{a.name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{a.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { if (confirm(`Retirer l'agent "${a.email}" ? Son compte sera supprimé.`)) del.mutate(a.id); }}
                        disabled={del.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'agent</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={onEdit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Nom complet</Label>
                <Input id="edit-name" name="name" defaultValue={editing.name ?? ""} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" name="email" type="email" defaultValue={editing.email} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-password">Nouveau mot de passe</Label>
                <Input id="edit-password" name="password" type="password" minLength={6} placeholder="Laisser vide pour ne pas changer" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={update.isPending}>
                  {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
