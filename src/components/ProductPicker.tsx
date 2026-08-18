import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ScanLine, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFCFA } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PickerProduct = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  price: number;
  stock: number;
};

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Tolerant match: all typed words must appear somewhere in the haystack. */
function matches(product: PickerProduct, query: string) {
  const hay = normalize(`${product.name} ${product.sku ?? ""} ${product.barcode ?? ""} ${product.category ?? ""}`);
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

type Props = {
  products: PickerProduct[];
  onSelect: (product: PickerProduct) => void;
  onScan?: () => void;
  autoFocus?: boolean;
  /** Show the favourites (best sellers) grid. */
  showFavorites?: boolean;
};

export function ProductPicker({ products, onSelect, onScan, autoFocus, showFavorites = true }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  // Best sellers over the last 60 days (for the favourites grid)
  const { data: topIds = [] } = useQuery({
    queryKey: ["top-products"],
    enabled: showFavorites,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 60);
      const { data } = await supabase
        .from("sales")
        .select("product_id, quantity, is_cancelled, created_at")
        .gte("created_at", since.toISOString())
        .limit(2000);
      const totals = new Map<string, number>();
      for (const s of data ?? []) {
        if (s.is_cancelled || !s.product_id) continue;
        totals.set(s.product_id, (totals.get(s.product_id) ?? 0) + Number(s.quantity));
      }
      return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    },
  });

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))].sort(),
    [products],
  );

  const favorites = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const ranked = topIds.map((id) => byId.get(id)).filter((p): p is PickerProduct => !!p && p.stock > 0);
    if (ranked.length >= 6) return ranked.slice(0, 8);
    const rest = products.filter((p) => p.stock > 0 && !ranked.some((r) => r.id === p.id));
    return [...ranked, ...rest].slice(0, 8);
  }, [topIds, products]);

  const results = useMemo(() => {
    let list = products;
    if (category) list = list.filter((p) => p.category === category);
    if (query.trim()) list = list.filter((p) => matches(p, query));
    return list.slice(0, 40);
  }, [products, query, category]);

  useEffect(() => setCursor(0), [query, category]);

  const commit = (p: PickerProduct | undefined) => {
    if (!p) return;
    onSelect(p);
    setQuery("");
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(results[cursor]);
    } else if (e.key === "Escape") {
      setQuery("");
    }
  };

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Nom, référence ou code-barres..."
            className="h-11 pl-9 pr-9 text-base"
            inputMode="search"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label="Effacer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {onScan && (
          <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={onScan} title="Scanner">
            <ScanLine className="h-5 w-5" />
          </Button>
        )}
      </div>

      {categories.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <Button
            type="button"
            size="sm"
            variant={category === null ? "default" : "outline"}
            className="h-8 shrink-0"
            onClick={() => setCategory(null)}
          >
            Tout
          </Button>
          {categories.map((c) => (
            <Button
              key={c}
              type="button"
              size="sm"
              variant={category === c ? "default" : "outline"}
              className="h-8 shrink-0"
              onClick={() => setCategory(category === c ? null : c)}
            >
              {c}
            </Button>
          ))}
        </div>
      )}

      {showFavorites && !query && favorites.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Star className="h-3.5 w-3.5 text-accent" /> Produits fréquents
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {favorites.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => commit(p)}
                className="rounded-xl border bg-card p-3 text-left transition active:scale-[0.97] hover:border-primary/50 hover:bg-muted/40"
              >
                <div className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight">{p.name}</div>
                <div className="mt-1 text-sm font-semibold text-accent">{formatFCFA(p.price)}</div>
                <div className="text-[11px] text-muted-foreground">Stock {p.stock}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={listRef} className="max-h-64 overflow-y-auto rounded-lg border">
        {results.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">Aucun produit trouvé.</div>
        )}
        {results.map((p, i) => (
          <button
            key={p.id}
            type="button"
            data-idx={i}
            onMouseEnter={() => setCursor(i)}
            onClick={() => commit(p)}
            className={cn(
              "flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-b-0",
              i === cursor ? "bg-primary/10" : "hover:bg-muted/40",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {p.sku ?? p.barcode ?? p.category ?? "—"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">{formatFCFA(p.price)}</div>
              {p.stock <= 0 ? (
                <Badge variant="destructive" className="mt-0.5 text-[10px]">Rupture</Badge>
              ) : (
                <div className="text-[11px] text-muted-foreground">Stock {p.stock}</div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
