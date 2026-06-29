import { describe, it, expect } from 'vitest';
import { wasContentEdited } from '../utils/wasContentEdited';

describe('wasContentEdited', () => {
  it('returns false when lastEditedAt is null', () => {
    expect(wasContentEdited('2026-01-01 12:00:00', null)).toBe(false);
  });

  it('returns false when lastEditedAt equals createdAt', () => {
    expect(wasContentEdited('2026-01-01 12:00:00', '2026-01-01 12:00:00')).toBe(false);
  });

  it('returns true when lastEditedAt is after createdAt', () => {
    expect(wasContentEdited('2026-01-01 12:00:00', '2026-01-01 12:05:00')).toBe(true);
  });
});
