import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getBasePath, getCookiePath, stripBasePath, withBasePath, buildForumAbsoluteUrl } from '../utils/basePath';
import { sanitizeRedirectPath, authCompleteUrl } from '../utils/safeRedirect';

describe('basePath', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to empty when unset', () => {
    vi.stubEnv('BASE_PATH', '');
    expect(getBasePath()).toBe('');
    expect(withBasePath('/login')).toBe('/login');
    expect(withBasePath('/')).toBe('/');
    expect(getCookiePath()).toBe('/');
  });

  it('normalizes BASE_PATH without trailing slash', () => {
    vi.stubEnv('BASE_PATH', '/forum-furiosum');
    expect(getBasePath()).toBe('/forum-furiosum');
    expect(withBasePath('/login')).toBe('/forum-furiosum/login');
    expect(withBasePath('/')).toBe('/forum-furiosum/');
    expect(getCookiePath()).toBe('/forum-furiosum');
  });

  it('strips BASE_PATH for internal validation', () => {
    vi.stubEnv('BASE_PATH', '/forum-furiosum');
    expect(stripBasePath('/forum-furiosum/threads/1')).toBe('/threads/1');
    expect(stripBasePath('/threads/1')).toBe('/threads/1');
  });

  it('buildForumAbsoluteUrl prefers FORUM_BASE_URL', () => {
    vi.stubEnv('FORUM_BASE_URL', 'https://example.com/forum-furiosum');
    expect(buildForumAbsoluteUrl('/js/embed-host.js', 'https://example.com'))
      .toBe('https://example.com/forum-furiosum/js/embed-host.js');
  });

  it('buildForumAbsoluteUrl falls back to origin and BASE_PATH', () => {
    vi.stubEnv('BASE_PATH', '/forum-furiosum');
    expect(buildForumAbsoluteUrl('/js/embed-host.js', 'https://example.com'))
      .toBe('https://example.com/forum-furiosum/js/embed-host.js');
  });
});

describe('safeRedirect with BASE_PATH', () => {
  beforeEach(() => {
    vi.stubEnv('BASE_PATH', '/forum-furiosum');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefixes safe redirect targets', () => {
    expect(sanitizeRedirectPath('/threads/abc')).toBe('/threads/abc');
    expect(withBasePath(sanitizeRedirectPath('/threads/abc'))).toBe('/forum-furiosum/threads/abc');
  });

  it('accepts paths that already include BASE_PATH', () => {
    expect(sanitizeRedirectPath('/forum-furiosum/threads/abc')).toBe('/threads/abc');
  });

  it('builds auth complete URLs under BASE_PATH', () => {
    expect(authCompleteUrl('login', '/threads/1')).toBe(
      '/forum-furiosum/auth/complete?event=login&next=%2Fforum-furiosum%2Fthreads%2F1',
    );
  });
});
