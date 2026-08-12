// Pure currency conversion helpers.
// All rates are stored as "units of target currency per 1 USD" (base = USD).

export type RateLookup = (targetCurrency: string) => number | undefined;

export function convertAmount(
  amount: number,
  fromCurrency: string,
  baseCurrency: string,
  rateFor: RateLookup,
): number {
  if (fromCurrency === baseCurrency) return amount;
  const fromUsd = rateFor(fromCurrency);
  const toUsd = rateFor(baseCurrency);
  if (!fromUsd || !toUsd) return amount;
  return (amount / fromUsd) * toUsd;
}

// Build a rate lookup for a specific date from a list of rate rows,
// falling back to the most recent known rate when the date is missing.
export function buildDateRateLookup(
  rows: { date: string; target: string; rate: number }[],
): { byDate: Map<string, Record<string, number>>; latest: Record<string, number>; lookupFor: (date: string) => RateLookup } {
  const byDate = new Map<string, Record<string, number>>();
  const latest: Record<string, number> = {};
  for (const r of rows) {
    latest[r.target] = r.rate;
    let m = byDate.get(r.date);
    if (!m) { m = {}; byDate.set(r.date, m); }
    m[r.target] = r.rate;
  }
  const lookupFor = (date: string): RateLookup => (target: string) => {
    if (target === 'USD') return 1;
    const m = byDate.get(date);
    if (m && m[target] !== undefined) return m[target];
    return latest[target];
  };
  return { byDate, latest, lookupFor };
}
