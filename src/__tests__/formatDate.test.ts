import { describe, it, expect } from 'vitest';
import { formatDisplayDate } from '../utils/formatDate';

describe('formatDisplayDate', () => {
  it('formats SQLite datetime strings as YYYY-MM-DD', () => {
    expect(formatDisplayDate('2026-06-26 18:41:35')).toBe('2026-06-26');
  });

  it('formats ISO datetime strings as YYYY-MM-DD', () => {
    expect(formatDisplayDate('2026-06-26T18:41:35.000Z')).toBe('2026-06-26');
  });

  it('returns empty string for nullish values', () => {
    expect(formatDisplayDate(null)).toBe('');
    expect(formatDisplayDate(undefined)).toBe('');
    expect(formatDisplayDate('')).toBe('');
  });
});
