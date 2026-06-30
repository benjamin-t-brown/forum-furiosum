import { describe, it, expect } from 'vitest';
import { formatDisplayDate, parseStoredTimestamp, toIsoTimestamp } from '../utils/formatDate';

describe('parseStoredTimestamp', () => {
  it('parses SQLite datetime as UTC', () => {
    const date = parseStoredTimestamp('2026-06-26 18:41:35');
    expect(date?.toISOString()).toBe('2026-06-26T18:41:35.000Z');
  });

  it('parses ISO datetime strings', () => {
    const date = parseStoredTimestamp('2026-06-26T18:41:35.000Z');
    expect(date?.toISOString()).toBe('2026-06-26T18:41:35.000Z');
  });

  it('returns null for invalid values', () => {
    expect(parseStoredTimestamp(null)).toBeNull();
    expect(parseStoredTimestamp('')).toBeNull();
    expect(parseStoredTimestamp('not-a-date')).toBeNull();
  });
});

describe('toIsoTimestamp', () => {
  it('returns ISO string for SQLite datetime', () => {
    expect(toIsoTimestamp('2026-06-26 18:41:35')).toBe('2026-06-26T18:41:35.000Z');
  });

  it('returns empty string for nullish values', () => {
    expect(toIsoTimestamp(null)).toBe('');
    expect(toIsoTimestamp(undefined)).toBe('');
  });
});

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
