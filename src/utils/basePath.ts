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
