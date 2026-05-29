import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, ScanLine, Trash2, ShoppingCart, X, CalendarIcon, Ban, RotateCcw } from "lucide-react";
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
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { formatFCFA, formatDateTime } from "@/lib/format";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

export const Route = createFileRoute("/_app/sales")({
  component: SalesPage,
});

type CartItem = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  max_stock: number;
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23,59,59,999); return x; }

type PresetKey = "today" | "7d" | "30d" | "90d" | "month" | "custom";

function getPresetRange(key: PresetKey): DateRange {
  const now = new Date();
  const to = endOfDay(now);
  if (key === "today") return { from: startOfDay(now), to };
  if (key === "7d") { const f = new Date(now); f.setDate(f.getDate() - 6); return { from: startOfDay(f), to }; }
  if (key === "30d") { const f = new Date(now); f.setDate(f.getDate() - 29); return { from: startOfDay(f), to }; }
  if (key === "90d") { const f = new Date(now); f.setDate(f.getDate() - 89); return { from: startOfDay(f), to }; }
  if (key === "month") { const f = new Date(now.getFullYear(), now.getMonth(), 1); return { from: startOfDay(f), to }; }
  return { from: startOfDay(now), to };
}

function formatRange(r: DateRange) {
  const fmt = (d: Date) => new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(d);
  if (!r.from) return "Choisir une période";
  if (!r.to || r.from.toDateString() === r.to.toDateString()) return fmt(r.from);
  return `${fmt(r.from)} — ${fmt(r.to)}`;
}

function SalesPage() {
  const { user } = useAuth();
  const { shopId, isOwner } = useRole();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState<number | "">("");
  const [scanOpen, setScanOpen] = useState(false);

  // Grouped sale
  const [groupOpen, setGroupOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [addProductId, setAddProductId] = useState<string>("");
  const [addQty, setAddQty] = useState(1);
  const [groupScanOpen, setGroupScanOpen] = useState(false);

  // Date range
  const [preset, setPreset] = useState<PresetKey>("30d");
  const [range, setRange] = useState<DateRange>(() => getPresetRange("30d"));
  const [dateOpen, setDateOpen] = useState(false);

  const from = range.from ? startOfDay(range.from) : startOfDay(new Date());
  const to = range.to ? endOfDay(range.to) : endOfDay(range.from ?? new Date());

  const applyPreset = (k: PresetKey) => {
    setPreset(k);
    if (k !== "custom") setRange(getPresetRange(k));
  };

  const presets: { key: PresetKey; label: string }[] = [
    { key: "today", label: "Aujourd'hui" },
    { key: "7d", label: "7 jours" },
    { key: "30d", label: "30 jours" },
    { key: "90d", label: "90 jours" },
    { key: "month", label: "Ce mois" },
  ];

  const { data: products = [] } = useQuery({
    queryKey: ["products", user!.id],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("name");
      return data ?? [];
    },
  });

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales", user!.id, from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("*")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .order("created_at", { ascending: false })
        .limit(1000);
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

  const addToCart = (pid: string, quantity: number) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return toast.error("Produit introuvable");
    if (quantity < 1) return toast.error("Quantité invalide");
    setCart((prev) => {
      const existing = prev.find((c) => c.product_id === pid);
      const newQty = (existing?.quantity ?? 0) + quantity;
      if (newQty > p.stock) {
        toast.error(`Stock insuffisant pour ${p.name} (${p.stock})`);
        return prev;
      }
      if (existing) {
        return prev.map((c) => c.product_id === pid ? { ...c, quantity: newQty } : c);
      }
      return [...prev, {
        product_id: p.id,
        product_name: p.name,
        quantity,
        unit_price: Number(p.price),
        max_stock: p.stock,
      }];
    });
    setAddProductId("");
    setAddQty(1);
  };

  const updateCartItem = (pid: string, patch: Partial<CartItem>) => {
    setCart((prev) => prev.map((c) => c.product_id === pid ? { ...c, ...patch } : c));
  };

  const removeFromCart = (pid: string) => setCart((prev) => prev.filter((c) => c.product_id !== pid));

  const cartTotal = cart.reduce((a, c) => a + c.unit_price * c.quantity, 0);

  const createGroup = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Ajoutez au moins un produit");
      for (const item of cart) {
        if (item.quantity < 1) throw new Error(`Quantité invalide pour ${item.product_name}`);
        if (item.quantity > item.max_stock) throw new Error(`Stock insuffisant pour ${item.product_name} (${item.max_stock})`);
      }
      const rows = cart.map((c) => ({
        user_id: user!.id,
        product_id: c.product_id,
        product_name: c.product_name,
        quantity: c.quantity,
        unit_price: c.unit_price,
        total: c.unit_price * c.quantity,
      }));
      const { error } = await supabase.from("sales").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(`Vente groupée enregistrée (${cart.length} produits)`);
      setCart([]);
      setGroupOpen(false);
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

  const toggleCancel = useMutation({
    mutationFn: async ({ id, cancel }: { id: string; cancel: boolean }) => {
      const { error } = await supabase
        .from("sales")
        .update({ is_cancelled: cancel })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(vars.cancel ? "Vente annulée (stock restauré)" : "Annulation retirée");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const periodTotal = sales.reduce((a, s) => a + (s.is_cancelled ? 0 : Number(s.total)), 0);

  return (
    <div>
      <PageHeader
        title="Ventes"
        subtitle={`${formatRange(range)} · Total: ${formatFCFA(periodTotal)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setScanOpen(true)}>
              <ScanLine className="h-4 w-4" /> Scanner
            </Button>
            <Button variant="outline" onClick={() => setGroupOpen(true)}>
              <ShoppingCart className="h-4 w-4" /> Vente groupée
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-emerald text-primary-foreground"><Plus className="h-4 w-4" /> Nouvelle vente</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Enregistrer une vente</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Produit</Label>
                    <div className="flex gap-2">
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
                      <Button type="button" variant="outline" size="icon" onClick={() => setScanOpen(true)} title="Scanner">
                        <ScanLine className="h-4 w-4" />
                      </Button>
                    </div>
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
          </div>
        }
      />

      <Card className="mb-6 p-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? "default" : "outline"}
              onClick={() => applyPreset(p.key)}
              className="h-8"
            >
              {p.label}
            </Button>
          ))}
        </div>
        <div className="ml-auto">
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={preset === "custom" ? "default" : "outline"}
                size="sm"
                className={cn("h-8 justify-start gap-2 font-normal", !range.from && "text-muted-foreground")}
              >
                <CalendarIcon className="h-4 w-4" />
                {formatRange(range)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={range}
                onSelect={(r) => {
                  if (r) {
                    setRange(r);
                    setPreset("custom");
                    if (r.from && r.to) setDateOpen(false);
                  }
                }}
                numberOfMonths={1}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>
      </Card>

      {/* Grouped sale dialog */}
      <Dialog open={groupOpen} onOpenChange={(v) => { setGroupOpen(v); if (!v) setCart([]); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vente groupée</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Card className="p-4 space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Ajouter un produit</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <Select value={addProductId} onValueChange={setAddProductId}>
                    <SelectTrigger><SelectValue placeholder="Sélectionner un produit" /></SelectTrigger>
                    <SelectContent>
                      {products.length === 0 && <div className="p-3 text-xs text-muted-foreground">Aucun produit.</div>}
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {formatFCFA(p.price)} (stock: {p.stock})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number"
                  min={1}
                  value={addQty}
                  onChange={(e) => setAddQty(Math.max(1, Number(e.target.value)))}
                  className="sm:w-24"
                  placeholder="Qté"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setGroupScanOpen(true)} title="Scanner">
                  <ScanLine className="h-4 w-4" />
                </Button>
                <Button type="button" onClick={() => addProductId && addToCart(addProductId, addQty)} disabled={!addProductId}>
                  <Plus className="h-4 w-4" /> Ajouter
                </Button>
              </div>
            </Card>

            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Produit</th>
                      <th className="px-3 py-2 text-right w-20">Qté</th>
                      <th className="px-3 py-2 text-right w-32">P.U.</th>
                      <th className="px-3 py-2 text-right w-32">Sous-total</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {cart.length === 0 && (
                      <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Aucun produit. Ajoutez-en au-dessus.</td></tr>
                    )}
                    {cart.map((c) => (
                      <tr key={c.product_id}>
                        <td className="px-3 py-2 font-medium">{c.product_name}</td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min={1}
                            max={c.max_stock}
                            value={c.quantity}
                            onChange={(e) => updateCartItem(c.product_id, { quantity: Math.max(1, Number(e.target.value)) })}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min={0}
                            value={c.unit_price}
                            onChange={(e) => updateCartItem(c.product_id, { unit_price: Math.max(0, Number(e.target.value)) })}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">{formatFCFA(c.unit_price * c.quantity)}</td>
                        <td className="px-3 py-2 text-right">
                          <Button variant="ghost" size="icon" onClick={() => removeFromCart(c.product_id)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Card className="p-4 bg-gradient-emerald text-primary-foreground flex items-center justify-between">
              <div>
                <div className="text-xs opacity-80">Total ({cart.length} produit{cart.length > 1 ? "s" : ""}, {cart.reduce((a, c) => a + c.quantity, 0)} article{cart.reduce((a, c) => a + c.quantity, 0) > 1 ? "s" : ""})</div>
                <div className="font-display text-3xl font-bold">{formatFCFA(cartTotal)}</div>
              </div>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCart([])} disabled={cart.length === 0}>Vider</Button>
            <Button onClick={() => createGroup.mutate()} disabled={createGroup.isPending || cart.length === 0}>
              Valider la vente groupée
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={(code) => {
          setScanOpen(false);
          const match = products.find((p) => p.barcode === code);
          if (match) {
            setProductId(match.id);
            setUnitPrice("");
            setOpen(true);
            toast.success(`Produit: ${match.name}`);
          } else {
            toast.error(`Code "${code}" introuvable. Ajoutez-le à un produit.`);
          }
        }}
      />

      <BarcodeScanner
        open={groupScanOpen}
        onClose={() => setGroupScanOpen(false)}
        onDetected={(code) => {
          setGroupScanOpen(false);
          const match = products.find((p) => p.barcode === code);
          if (match) {
            addToCart(match.id, 1);
            toast.success(`Ajouté: ${match.name}`);
          } else {
            toast.error(`Code "${code}" introuvable.`);
          }
        }}
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
                <tr key={s.id} className={cn("hover:bg-muted/30", s.is_cancelled && "bg-destructive/5 text-muted-foreground line-through")}>
                  <td className="px-4 py-3 text-muted-foreground no-underline">{formatDateTime(s.created_at)}</td>
                  <td className="px-4 py-3 font-medium">
                    {s.product_name}
                    {s.is_cancelled && <span className="ml-2 inline-block rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive no-underline">Annulée</span>}
                  </td>
                  <td className="px-4 py-3 text-right">{s.quantity}</td>
                  <td className="px-4 py-3 text-right">{formatFCFA(Number(s.unit_price))}</td>
                  <td className={cn("px-4 py-3 text-right font-semibold", !s.is_cancelled && "text-accent")}>{formatFCFA(Number(s.total))}</td>
                  <td className="px-4 py-3 text-right no-underline">
                    <div className="flex justify-end gap-1">
                      {s.is_cancelled ? (
                        <Button variant="ghost" size="icon" title="Rétablir la vente" onClick={() => toggleCancel.mutate({ id: s.id, cancel: false })}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon" title="Annuler la vente" onClick={() => { if (confirm("Annuler cette vente ? Le stock sera restauré.")) toggleCancel.mutate({ id: s.id, cancel: true }); }}>
                          <Ban className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Supprimer définitivement" onClick={() => { if (confirm("Supprimer définitivement cette vente ?")) del.mutate(s.id); }}>
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
