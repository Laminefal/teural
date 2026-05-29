import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Check, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRole } from "@/lib/role";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatFCFA } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/debts")({
  component: DebtsPage,
});

type DebtType = "creance" | "dette";
type Filter = "all" | DebtType;

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function DebtsPage() {
  const { user } = useAuth();
  const { shopId, isOwner } = useRole();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<DebtType>("creance");
  const [filter, setFilter] = useState<Filter>("all");

  const { data: debts = [], isLoading } = useQuery({
    queryKey: ["debts", user!.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("debts").select("*").order("is_paid").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (vars: { person_name: string; type: DebtType; amount: number; description: string; due_date: string }) => {
      if (!shopId) throw new Error("Boutique introuvable");
      const { error } = await supabase.from("debts").insert({
        user_id: user!.id,
        shop_id: shopId,
        person_name: vars.person_name,
        type: vars.type,
        amount: vars.amount,
        description: vars.description || null,
        due_date: vars.due_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["debts"] });
      setOpen(false);
      toast.success("Dette enregistrée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const togglePaid = useMutation({
    mutationFn: async (vars: { id: string; is_paid: boolean }) => {
      const { error } = await supabase.from("debts").update({ is_paid: vars.is_paid, updated_at: new Date().toISOString() }).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debts"] }),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("debts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["debts"] }),
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({
      type,
      person_name: String(fd.get("person_name") || "").trim(),
      amount: Number(fd.get("amount") || 0),
      description: String(fd.get("description") || ""),
      due_date: String(fd.get("due_date") || ""),
    });
  };

  const totalCreance = debts.filter((d) => d.type === "creance" && !d.is_paid).reduce((a, d) => a + Number(d.amount), 0);
  const totalDette = debts.filter((d) => d.type === "dette" && !d.is_paid).reduce((a, d) => a + Number(d.amount), 0);
  const filtered = debts.filter((d) => filter === "all" || d.type === filter);

  return (
    <div>
      <PageHeader
        title="Dettes & Créances"
        subtitle="Suivez qui vous doit et à qui vous devez"
        action={
          isOwner ? null : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-emerald text-primary-foreground"><Plus className="h-4 w-4" /> Nouvelle entrée</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enregistrer une dette</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as DebtType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="creance">Créance (on me doit)</SelectItem>
                      <SelectItem value="dette">Dette (je dois)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="person_name">Nom de la personne</Label>
                  <Input id="person_name" name="person_name" required placeholder="Ex: Aïssatou Diop" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Montant (FCFA)</Label>
                  <Input id="amount" name="amount" type="number" required min={0} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="due_date">Date d'échéance</Label>
                  <Input id="due_date" name="due_date" type="date" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" placeholder="Optionnel" />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={create.isPending}>Enregistrer</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">On me doit</div>
          <div className="mt-1 text-2xl font-display font-semibold text-accent">{formatFCFA(totalCreance)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Je dois</div>
          <div className="mt-1 text-2xl font-display font-semibold text-destructive">{formatFCFA(totalDette)}</div>
        </Card>
      </div>

      <div className="mb-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">Tout</TabsTrigger>
            <TabsTrigger value="creance">On me doit</TabsTrigger>
            <TabsTrigger value="dette">Je dois</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Personne</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Échéance</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Chargement...</td></tr>}
              {!isLoading && filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Aucune entrée.</td></tr>}
              {filtered.map((d) => (
                <tr key={d.id} className={cn("hover:bg-muted/30", d.is_paid && "opacity-60")}>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      d.type === "creance" ? "bg-accent/15 text-accent" : "bg-destructive/15 text-destructive",
                    )}>
                      {d.type === "creance" ? "On me doit" : "Je dois"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium">{d.person_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{d.description ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(d.due_date)}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold", d.type === "creance" ? "text-accent" : "text-destructive")}>
                    {formatFCFA(Number(d.amount))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                      d.is_paid ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground",
                    )}>
                      {d.is_paid ? "Soldé" : "En cours"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" title={d.is_paid ? "Rouvrir" : "Marquer soldé"} onClick={() => togglePaid.mutate({ id: d.id, is_paid: !d.is_paid })}>
                      {d.is_paid ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    </Button>
                    {isOwner && <Button variant="ghost" size="icon" onClick={() => { if (confirm("Supprimer ?")) del.mutate(d.id); }}><Trash2 className="h-4 w-4" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
