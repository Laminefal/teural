export const formatFCFA = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v) + " FCFA";
};

export const formatDate = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));

export const formatDateTime = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

/* ------------------------------ unités de vente --------------------------- */

export type ProductUnit = "unite" | "kg" | "l";

export const UNIT_OPTIONS: { value: ProductUnit; label: string }[] = [
  { value: "unite", label: "Unité (pièce)" },
  { value: "kg", label: "Poids (kg)" },
  { value: "l", label: "Volume (litre)" },
];

/** Suffixe court affiché après une quantité ("" pour les pièces). */
export const unitShort = (unit?: string | null) =>
  unit === "kg" ? "kg" : unit === "l" ? "l" : "";

/** Vrai si le produit se vend en quantité décimale (poids / volume). */
export const isBulkUnit = (unit?: string | null) => unit === "kg" || unit === "l";

/** Ex: 2,5 kg · 1,5 l · 3 */
export const formatQty = (q: number | null | undefined, unit?: string | null) => {
  const v = Number(q ?? 0);
  const txt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(v);
  const s = unitShort(unit);
  return s ? `${txt} ${s}` : txt;
};

/** Ex: "Prix de vente (FCFA / kg)" */
export const unitPriceLabel = (unit?: string | null, base = "Prix de vente") => {
  const s = unitShort(unit);
  return s ? `${base} (FCFA / ${s})` : `${base} (FCFA)`;
};
