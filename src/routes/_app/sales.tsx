import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, ScanLine, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { formatFCFA, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_app/sales")({
  component: SalesPage,
});

function SalesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState<number | "">("");

  const { data: products = [] } = useQuery({
    queryKey: ["products", user!.id],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("name");
      return data ?? [];
    },
  });

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", user!.id],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(200);
      return data ?? [];
    },
  });

  const selected = useMemo(() => products.find((p) => p.id === productId), [products, productId]);
  const effectivePrice = unitPrice === "" ? Number(selected?.price ?? 0) : Number(unitPrice);
  const total = effectivePrice * qty;

  const create = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Choisissez un produit");
      if (qty < 1) throw new Error("Quantité invalide");
      if (selected.stock < qty) throw new Error(`Stock insuffisant (${selected.stock})`);
      const { error } = await supabase.from("sales").insert({
        user_id: user!.id,
        product_id: selected.id,
        product_name: selected.name,
        quantity: qty,
        unit_price: effectivePrice,
        total: effectivePrice * qty,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Vente enregistrée");
      setOpen(false); setProductId(""); setQty(1); setUnitPrice("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Vente supprimée");
    },
  });

  const todayTotal = sales
    .filter((s) => { const d = new Date(s.created_at); const t = new Date(); t.setHours(0,0,0,0); return d >= t; })
    .reduce((a, s) => a + Number(s.total), 0);

  return (
    <div>
      <PageHeader
        title="Ventes"
        subtitle={`Aujourd'hui: ${formatFCFA(todayTotal)}`}
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-emerald text-primary-foreground"><Plus className="h-4 w-4" /> Nouvelle vente</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Enregistrer une vente</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Produit</Label>
                  <Select value={productId} onValueChange={(v) => { setProductId(v); setUnitPrice(""); }}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner un produit" /></SelectTrigger>
                    <SelectContent>
                      {products.length === 0 && <div className="p-3 text-xs text-muted-foreground">Aucun produit. Créez-en d'abord.</div>}
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {formatFCFA(p.price)} (stock: {p.stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Quantité</Label>
                    <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prix unitaire (FCFA)</Label>
                    <Input type="number" placeholder={selected ? String(selected.price) : ""} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value === "" ? "" : Number(e.target.value))} />
                  </div>
                </div>
                {selected && (
                  <Card className="p-4 bg-gradient-emerald text-primary-foreground">
                    <div className="text-xs opacity-80">Total</div>
                    <div className="font-display text-3xl font-bold">{formatFCFA(total)}</div>
                  </Card>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={create.isPending || !selected}>Valider la vente</Button>
              </DialogFooter>
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
                <th className="px-4 py-3">Produit</th>
                <th className="px-4 py-3 text-right">Qté</th>
                <th className="px-4 py-3 text-right">P.U.</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Chargement...</td></tr>}
              {!isLoading && sales.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Aucune vente enregistrée.</td></tr>}
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(s.created_at)}</td>
                  <td className="px-4 py-3 font-medium">{s.product_name}</td>
                  <td className="px-4 py-3 text-right">{s.quantity}</td>
                  <td className="px-4 py-3 text-right">{formatFCFA(Number(s.unit_price))}</td>
                  <td className="px-4 py-3 text-right font-semibold text-accent">{formatFCFA(Number(s.total))}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm("Supprimer cette vente ? (le stock ne sera pas restauré)")) del.mutate(s.id); }}><Trash2 className="h-4 w-4" /></Button>
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
