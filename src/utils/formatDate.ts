/** Parse a timestamp stored by SQLite or ISO strings into a Date (UTC). */
export function parseStoredTimestamp(value: string | Date | null | undefined): Date | null {
  if (value == null || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const str = String(value).trim();
  if (!str) {
    return null;
  }

  if (str.includes('T')) {
    const date = new Date(str);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const sqliteMatch = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(str);
  if (sqliteMatch) {
    return new Date(`${sqliteMatch[1]}T${sqliteMatch[2]}Z`);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(`${str}T00:00:00Z`);
  }

  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ISO 8601 string for use in `<time datetime="">`. */
export function toIsoTimestamp(value: string | Date | null | undefined): string {
  const date = parseStoredTimestamp(value);
  return date ? date.toISOString() : '';
}

/** Format a stored timestamp for display as an ISO 8601 calendar date (YYYY-MM-DD). */
export function formatDisplayDate(value: string | Date | null | undefined): string {
  const date = parseStoredTimestamp(value);
  if (!date) {
    return value == null || value === '' ? '' : String(value);
  }

  return date.toISOString().slice(0, 10);
}
