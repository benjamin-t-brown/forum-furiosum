import { describe, it, expect } from 'vitest';
import { normalizeFormString, normalizeLineEndings } from '../utils/normalizeLineEndings';
import { getPostBodyValidationError, MAX_POST_BODY_LENGTH } from '../utils/postBodyLimits';
import { trimFormStrings } from '../utils/trimFormStrings';

describe('normalizeLineEndings', () => {
  it('converts CRLF and CR to LF', () => {
    expect(normalizeLineEndings('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('lets CRLF-heavy text pass post validation after form normalization', () => {
    const sample = 'x'.repeat(MAX_POST_BODY_LENGTH - 16) + '\n'.repeat(16);
    const crlf = sample.replace(/\n/g, '\r\n');
    expect(crlf.length).toBeGreaterThan(MAX_POST_BODY_LENGTH);

    const normalized = trimFormStrings({ body: crlf }).body as string;
    expect(normalized.length).toBeLessThanOrEqual(MAX_POST_BODY_LENGTH);
    expect(getPostBodyValidationError(normalized)).toBeNull();
  });
});

describe('normalizeFormString', () => {
  it('normalizes line endings and trims outer whitespace', () => {
    expect(normalizeFormString('  a\r\nb  ')).toBe('a\nb');
  });
});
