import type { ParsedQs } from 'qs';

export const HOME_THREADS_PER_PAGE = 10;
export const CATEGORY_THREADS_PER_PAGE = 20;

export function parsePageQuery(query: ParsedQs): number {
  const raw = query.page;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const page = parseInt(String(value ?? '1'), 10);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

export function categoryListPath(slug: string): string {
  return `/categories/${slug}`;
}

export function categoryPageHref(slug: string, page: number, showDeleted: boolean): string {
  const params = new URLSearchParams();
  if (page > 1) {
    params.set('page', String(page));
  }
  if (showDeleted) {
    params.set('showDeleted', '1');
  }
  const qs = params.toString();
  const base = categoryListPath(slug);
  return qs ? `${base}?${qs}` : base;
}
