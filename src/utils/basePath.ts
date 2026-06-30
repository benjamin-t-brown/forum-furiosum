import type { Response } from 'express';

/** Normalized mount path without trailing slash, or '' when served at domain root. */
export function getBasePath(): string {
  const raw = process.env.BASE_PATH?.trim();
  if (!raw || raw === '/') {
    return '';
  }
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeading.replace(/\/+$/, '');
}

/** Prefix an app-relative path with BASE_PATH for browser-facing URLs. */
export function withBasePath(path: string): string {
  const base = getBasePath();
  const normalized = path.startsWith('/') ? path : `/${path}`;

  if (!base) {
    return normalized;
  }
  if (normalized === '/') {
    return `${base}/`;
  }
  return `${base}${normalized}`;
}

/**
 * Absolute public URL for a forum-relative path (e.g. /js/embed-host.js).
 * Prefer FORUM_BASE_URL when set — it includes the subpath and matches what browsers use.
 */
export function buildForumAbsoluteUrl(appRelativePath: string, reqOrigin?: string): string {
  const path = appRelativePath.startsWith('/') ? appRelativePath : `/${appRelativePath}`;
  const forumUrl = process.env.FORUM_BASE_URL?.trim().replace(/\/+$/, '');
  if (forumUrl) {
    return `${forumUrl}${path}`;
  }
  const origin = (reqOrigin ?? '').replace(/\/+$/, '');
  if (!origin) {
    return withBasePath(path);
  }
  return `${origin}${withBasePath(path)}`;
}

/** Remove BASE_PATH prefix from an incoming or stored path (for validation). */
export function stripBasePath(path: string): string {
  const base = getBasePath();
  if (!base) {
    return path;
  }

  const qIndex = path.indexOf('?');
  const pathname = qIndex === -1 ? path : path.slice(0, qIndex);
  const query = qIndex === -1 ? '' : path.slice(qIndex);

  if (pathname === base || pathname === `${base}/`) {
    return `/${query}`;
  }
  if (pathname.startsWith(`${base}/`)) {
    return `${pathname.slice(base.length)}${query}`;
  }
  return path;
}

/** Cookie path scoped to the forum mount (avoids sharing cookies with sibling apps). */
export function getCookiePath(): string {
  return getBasePath() || '/';
}

export function redirectTo(res: Response, path: string): void {
  res.redirect(withBasePath(path));
}
