import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forwardRef, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, ScanLine, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { formatFCFA } from "@/lib/format";

export const Route = createFileRoute("/_app/products")({
  component: ProductsPage,
});

type Product = {
  id: string; name: string; sku: string | null; barcode: string | null; category: string | null;
  price: number; cost: number; stock: number; low_stock_threshold: number;
};

function generateSKU(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 20);
  if (!base) return "";
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${base}-${suffix}`;
}

function ProductsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState("");
  const [scanOpen, setScanOpen] = useState(false);

  const [formName, setFormName] = useState("");
  const skuInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const skuTouched = useRef(false);

  useEffect(() => {
    if (open) {
      if (!editing) {
        setFormName("");
        skuTouched.current = false;
        if (skuInputRef.current) skuInputRef.current.value = "";
        if (barcodeInputRef.current) barcodeInputRef.current.value = "";
      } else {
        setFormName(editing.name);
        skuTouched.current = true;
        if (skuInputRef.current) skuInputRef.current.value = editing.sku ?? "";
        if (barcodeInputRef.current) barcodeInputRef.current.value = editing.barcode ?? "";
      }
    }
  }, [open, editing]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", user!.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (p: Partial<Product> & { id?: string }) => {
      if (p.id) {
        const { error } = await supabase.from("products").update({
          name: p.name, sku: p.sku, barcode: p.barcode, category: p.category,
          price: p.price, cost: p.cost, stock: p.stock,
          low_stock_threshold: p.low_stock_threshold, updated_at: new Date().toISOString(),
        }).eq("id", p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("products").insert({
          user_id: user!.id, name: p.name!, sku: p.sku ?? null, barcode: p.barcode ?? null,
          category: p.category ?? null,
          price: p.price ?? 0, cost: p.cost ?? 0, stock: p.stock ?? 0,
          low_stock_threshold: p.low_stock_threshold ?? 5,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setOpen(false); setEditing(null);
      toast.success("Produit enregistré");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Produit supprimé");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormName(val);
    if (!editing && !skuTouched.current && skuInputRef.current) {
      skuInputRef.current.value = generateSKU(val);
    }
  };

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    upsert.mutate({
      id: editing?.id,
      name: String(fd.get("name")),
      sku: String(fd.get("sku") || "") || null,
      barcode: String(fd.get("barcode") || "") || null,
      category: String(fd.get("category") || "") || null,
      price: Number(fd.get("price") || 0),
      cost: Number(fd.get("cost") || 0),
      stock: Number(fd.get("stock") || 0),
      low_stock_threshold: Number(fd.get("low_stock_threshold") || 5),
    });
  };

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
      || p.sku?.toLowerCase().includes(search.toLowerCase())
      || p.barcode?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Produits"
        subtitle="Gérez votre inventaire"
        action={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-emerald text-primary-foreground" onClick={() => setEditing(null)}>
                <Plus className="h-4 w-4" /> Nouveau produit
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Modifier" : "Nouveau"} produit</DialogTitle></DialogHeader>
              <form onSubmit={onSubmit} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nom" name="name" value={formName} onChange={handleNameChange} required />
                  <Field label="Catégorie" name="category" defaultValue={editing?.category ?? ""} placeholder="Boissons, Riz..." />
                  <Field label="Référence (SKU)" name="sku" ref={skuInputRef} onChange={() => { skuTouched.current = true; }} />
                  <Field label="Stock" name="stock" type="number" defaultValue={editing?.stock ?? 0} required />
                  <Field label="Prix de vente (FCFA)" name="price" type="number" defaultValue={editing?.price ?? 0} required />
                  <Field label="Coût d'achat (FCFA)" name="cost" type="number" defaultValue={editing?.cost ?? 0} />
                  <Field label="Seuil alerte stock" name="low_stock_threshold" type="number" defaultValue={editing?.low_stock_threshold ?? 5} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={upsert.isPending}>Enregistrer</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4">
        <Input placeholder="Rechercher un produit..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Produit</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3 text-right">Prix</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Valeur</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Chargement...</td></tr>}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Aucun produit. Cliquez sur "Nouveau produit" pour commencer.</td></tr>
              )}
              {filtered.map((p) => {
                const low = p.stock <= p.low_stock_threshold;
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.name}</div>
                      {p.sku && <div className="text-xs text-muted-foreground">{p.sku}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatFCFA(p.price)}</td>
                    <td className="px-4 py-3 text-right">
                      {low ? (
                        <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{p.stock}</Badge>
                      ) : (
                        <span className="font-medium">{p.stock}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{formatFCFA(p.cost * p.stock)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Supprimer "${p.name}" ?`)) del.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const Field = forwardRef<HTMLInputElement, { label: string } & React.InputHTMLAttributes<HTMLInputElement>>(
  ({ label, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={props.name}>{label}</Label>
        <Input id={props.name} ref={ref} {...props} />
      </div>
    );
  },
);
Field.displayName = "Field";

