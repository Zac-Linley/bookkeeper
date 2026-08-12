import { describe, it, expect } from 'vitest';
import { convertAmount, buildDateRateLookup } from '../currency';

const AED_PER_USD = 3.67;
const CNY_PER_USD = 7.2;

describe('convertAmount', () => {
  it('returns the amount unchanged for the base currency', () => {
    expect(convertAmount(100, 'AED', 'AED', (t) => (t === 'USD' ? 1 : 0))).toBe(100);
  });

  it('converts CNY -> AED via USD anchor', () => {
    const rateFor = (t: string) => (t === 'USD' ? 1 : t === 'AED' ? AED_PER_USD : t === 'CNY' ? CNY_PER_USD : undefined);
    const result = convertAmount(100, 'CNY', 'AED', rateFor);
    expect(result).toBeCloseTo((100 / CNY_PER_USD) * AED_PER_USD, 5);
  });

  it('returns the amount unchanged when rates are missing', () => {
    const rateFor = () => undefined;
    expect(convertAmount(100, 'CNY', 'AED', rateFor)).toBe(100);
  });

  it('treats USD as its own rate', () => {
    const rateFor = (t: string) => (t === 'USD' ? 1 : t === 'AED' ? AED_PER_USD : undefined);
    expect(convertAmount(100, 'USD', 'AED', rateFor)).toBeCloseTo(100 * AED_PER_USD, 5);
  });
});

describe('buildDateRateLookup', () => {
  const rows = [
    { date: '2026-01-01', target: 'AED', rate: 3.6 },
    { date: '2026-01-01', target: 'CNY', rate: 7.0 },
    { date: '2026-08-01', target: 'AED', rate: AED_PER_USD },
    { date: '2026-08-01', target: 'CNY', rate: CNY_PER_USD },
  ];

  it('uses the rate for the exact date when available', () => {
    const { lookupFor } = buildDateRateLookup(rows);
    expect(lookupFor('2026-01-01')('CNY')).toBe(7.0);
  });

  it('falls back to the most recent known rate when the date is missing', () => {
    const { lookupFor } = buildDateRateLookup(rows);
    expect(lookupFor('2026-03-15')('CNY')).toBe(CNY_PER_USD);
  });

  it('converts a historical amount using the date-specific rate', () => {
    const { lookupFor } = buildDateRateLookup(rows);
    const converted = convertAmount(100, 'CNY', 'AED', lookupFor('2026-01-01'));
    expect(converted).toBeCloseTo((100 / 7.0) * 3.6, 5);
  });
});
