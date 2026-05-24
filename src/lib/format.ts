export const formatFCFA = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v) + " FCFA";
};

export const formatDate = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));

export const formatDateTime = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
