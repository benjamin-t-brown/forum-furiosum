const MAX_PADDING_PX = 64;

const PADDING_QUERY_KEYS = [
  'padding',
  'pad',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'padTop',
  'padRight',
  'padBottom',
  'padLeft',
] as const;

export interface EmbedPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function clampPx(value: number): number {
  return Math.min(MAX_PADDING_PX, Math.max(0, Math.round(value)));
}

function parsePx(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') {return undefined;}
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) {return undefined;}
  return clampPx(n);
}

import { buildForumAbsoluteUrl } from './basePath';

export const DEFAULT_EMBED_PADDING_PX = 16;

export function buildEmbedThreadUrl(origin: string, threadId: string, padding = DEFAULT_EMBED_PADDING_PX): string {
  const base = buildForumAbsoluteUrl(`/embed/threads/${threadId}`, origin);
  const px = clampPx(padding);
  if (px === 0) {return base;}
  return `${base}?padding=${px}`;
}

export function buildEmbedSnippet(origin: string, embedUrl: string): string {
  const scriptUrl = buildForumAbsoluteUrl('/js/embed-host.js', origin);
  return [
    `<iframe class="forum-furiosum-embed" src="${embedUrl}" width="100%" style="border:0" scrolling="no" title="Comments"></iframe>`,
    `<script src="${scriptUrl}" async></script>`,
  ].join('\n');
}

export function parseEmbedPadding(query: Record<string, unknown>): EmbedPadding {
  const all = parsePx(query.padding) ?? parsePx(query.pad);
  if (all !== undefined) {
    return { top: all, right: all, bottom: all, left: all };
  }

  return {
    top: parsePx(query.paddingTop) ?? parsePx(query.padTop) ?? 0,
    right: parsePx(query.paddingRight) ?? parsePx(query.padRight) ?? 0,
    bottom: parsePx(query.paddingBottom) ?? parsePx(query.padBottom) ?? 0,
    left: parsePx(query.paddingLeft) ?? parsePx(query.padLeft) ?? 0,
  };
}

export function embedPaddingStyle(padding: EmbedPadding): string {
  const { top, right, bottom, left } = padding;
  if (top === 0 && right === 0 && bottom === 0 && left === 0) {return '';}
  return `padding:${top}px ${right}px ${bottom}px ${left}px`;
}

/** Preserves padding-related query params for pagination and redirects. */
export function embedPaddingQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const key of PADDING_QUERY_KEYS) {
    const value = query[key];
    if (typeof value === 'string' && value.trim() !== '') {
      params.set(key, value);
    }
  }
  return params.toString();
}

export function appendEmbedPaddingQuery(path: string, query: Record<string, unknown>): string {
  const paddingQuery = embedPaddingQueryString(query);
  if (!paddingQuery) {return path;}
  return path.includes('?') ? `${path}&${paddingQuery}` : `${path}?${paddingQuery}`;
}
