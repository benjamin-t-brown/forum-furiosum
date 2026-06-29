import { describe, it, expect } from 'vitest';
import { sanitizeRedirectPath, authCompleteUrl } from '../utils/safeRedirect';

describe('safeRedirect', () => {
  describe('sanitizeRedirectPath', () => {
    it('allows same-origin relative paths', () => {
      expect(sanitizeRedirectPath('/threads/abc')).toBe('/threads/abc');
      expect(sanitizeRedirectPath('/threads/abc?page=2')).toBe('/threads/abc?page=2');
    });

    it('rejects external and invalid paths', () => {
      expect(sanitizeRedirectPath('https://evil.com')).toBe('/');
      expect(sanitizeRedirectPath('//evil.com')).toBe('/');
      expect(sanitizeRedirectPath(undefined)).toBe('/');
    });

    it('blocks auth loop pages', () => {
      expect(sanitizeRedirectPath('/login')).toBe('/');
      expect(sanitizeRedirectPath('/auth/complete?event=login&next=%2F')).toBe('/');
    });
  });

  describe('authCompleteUrl', () => {
    it('builds a complete URL with encoded next path', () => {
      expect(authCompleteUrl('login', '/threads/1')).toBe('/auth/complete?event=login&next=%2Fthreads%2F1');
    });
  });
});
