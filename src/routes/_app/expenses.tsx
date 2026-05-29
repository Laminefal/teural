import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Ban, RotateCcw } from "lucide-react";
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
import { formatFCFA, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/expenses")({
  component: ExpensesPage,
});

const CATEGORIES = ["Achat marchandise", "Loyer", "Électricité", "Eau", "Transport", "Salaires", "Téléphone/Internet", "Autre"];

function ExpensesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", user!.id],
    queryFn: async () => {
      const { data } = await supabase.from("expenses").select("*").order("created_at", { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (vars: { category: string; description: string; amount: number }) => {
      const { error } = await supabase.from("expenses").insert({
        user_id: user!.id, category: vars.category, description: vars.description || null, amount: vars.amount,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false);
      toast.success("Dépense ajoutée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const toggleCancel = useMutation({
    mutationFn: async ({ id, cancel }: { id: string; cancel: boolean }) => {
      const { error } = await supabase.from("expenses").update({ is_cancelled: cancel }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(vars.cancel ? "Dépense annulée" : "Annulation retirée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    create.mutate({
      category,
      description: String(fd.get("description") || ""),
      amount: Number(fd.get("amount") || 0),
    });
  };

  const today = new Date(); today.setHours(0,0,0,0);
  const todayTotal = expenses
    .filter((x: any) => !x.is_cancelled && new Date(x.created_at) >= today)
    .reduce((a, x) => a + Number(x.amount), 0);

  return (
    <div>
      <PageHeader
        title="Dépenses"
        subtitle={`Aujourd'hui: ${formatFCFA(todayTotal)}`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-emerald text-primary-foreground"><Plus className="h-4 w-4" /> Nouvelle dépense</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enregistrer une dépense</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Catégorie</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="amount">Montant (FCFA)</Label>
                  <Input id="amount" name="amount" type="number" required min={0} />
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
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Montant</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Chargement...</td></tr>}
              {!isLoading && expenses.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Aucune dépense enregistrée.</td></tr>}
              {expenses.map((x: any) => (
                <tr key={x.id} className={cn("hover:bg-muted/30", x.is_cancelled && "bg-destructive/5 text-muted-foreground line-through")}>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(x.created_at)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-medium text-gold-foreground no-underline">{x.category}</span>
                    {x.is_cancelled && <span className="ml-2 inline-block rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive no-underline">Annulée</span>}
                  </td>
                  <td className="px-4 py-3">{x.description ?? "—"}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold", !x.is_cancelled && "text-destructive")}>−{formatFCFA(Number(x.amount))}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1 no-underline">
                      {x.is_cancelled ? (
                        <Button variant="ghost" size="icon" title="Rétablir la dépense" onClick={() => toggleCancel.mutate({ id: x.id, cancel: false })}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" title="Annuler la dépense" onClick={() => { if (confirm("Annuler cette dépense ?")) toggleCancel.mutate({ id: x.id, cancel: true }); }}>
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Supprimer" onClick={() => { if (confirm("Supprimer définitivement ?")) del.mutate(x.id); }}>
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
    </div>
  );
}
