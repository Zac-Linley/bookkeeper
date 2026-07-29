/**
 * Format a Date to local YYYY-MM-DD without timezone offset issues.
 */
export function toLocalDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Format a Date to local YYYY-MM-DDTHH:mm for datetime-local input.
 */
export function toLocalDatetimeStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Convert a UTC ISO string to local YYYY-MM-DDTHH:mm for datetime-local input.
 */
export function utcToLocalDatetimeStr(iso: string): string {
  return toLocalDatetimeStr(new Date(iso));
}

/**
 * Convert a UTC ISO string to local YYYY-MM-DD.
 */
export function utcToLocalDateStr(iso: string): string {
  return toLocalDateStr(new Date(iso));
}
