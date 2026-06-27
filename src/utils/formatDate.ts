/** Format a stored timestamp for display as an ISO 8601 calendar date (YYYY-MM-DD). */
export function formatDisplayDate(value: string | Date | null | undefined): string {
  if (value == null || value === '') {
    return '';
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return '';
    }
    return value.toISOString().slice(0, 10);
  }

  const str = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(str);
  if (match) {
    return match[1];
  }

  const date = new Date(str);
  if (Number.isNaN(date.getTime())) {
    return str;
  }

  return date.toISOString().slice(0, 10);
}
