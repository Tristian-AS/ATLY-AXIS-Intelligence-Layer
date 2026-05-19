export function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: dollars >= 1000 ? 0 : 2,
  }).format(dollars);
}

export function dollarsToCents(input: number | string | null | undefined): number | null {
  if (input == null || input === "") return null;
  const n = typeof input === "string" ? Number(input.replace(/[$,\s]/g, "")) : input;
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relativeDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d) : d;
  const diffMs = dt.getTime() - Date.now();
  const days = Math.round(diffMs / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days}d`;
  return `${Math.abs(days)}d ago`;
}
