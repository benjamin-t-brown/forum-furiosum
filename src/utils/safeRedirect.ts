import { stripBasePath, withBasePath } from './basePath';

const BLOCKED_PATHS = new Set(['/login', '/logout', '/register', '/auth/complete']);

/** Returns an app-internal path safe for post-auth redirects (no BASE_PATH prefix). */
export function sanitizeRedirectPath(path: string | undefined, fallback = '/'): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) {
    return fallback;
  }

  const internalPath = stripBasePath(path);
  const pathname = internalPath.split('?')[0] ?? internalPath;
  if (BLOCKED_PATHS.has(pathname)) {
    return fallback;
  }

  return internalPath;
}

export function authCompleteUrl(event: 'login' | 'logout', next: string): string {
  const safeNext = withBasePath(sanitizeRedirectPath(next));
  return withBasePath(`/auth/complete?event=${event}&next=${encodeURIComponent(safeNext)}`);
}
