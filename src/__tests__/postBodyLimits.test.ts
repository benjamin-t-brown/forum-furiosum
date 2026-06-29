import { describe, it, expect } from 'vitest';
import { getPostBodyValidationError, MAX_POST_BODY_LENGTH } from '../utils/postBodyLimits';

describe('postBodyLimits', () => {
  it('accepts bodies within the limit', () => {
    expect(getPostBodyValidationError('hello')).toBeNull();
    expect(getPostBodyValidationError('x'.repeat(MAX_POST_BODY_LENGTH))).toBeNull();
  });

  it('rejects empty bodies', () => {
    expect(getPostBodyValidationError('')).toBe('Post body is required');
  });

  it('rejects bodies over the limit', () => {
    expect(getPostBodyValidationError('x'.repeat(MAX_POST_BODY_LENGTH + 1)))
      .toBe(`Post body must be at most ${MAX_POST_BODY_LENGTH} characters`);
  });
});
