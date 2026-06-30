import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  parseEmbedPadding,
  embedPaddingStyle,
  embedPaddingQueryString,
  appendEmbedPaddingQuery,
  buildEmbedThreadUrl,
  DEFAULT_EMBED_PADDING_PX,
  buildEmbedSnippet,
} from '../utils/embedPadding';

describe('embedPadding', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('parses uniform padding from padding or pad', () => {
    expect(parseEmbedPadding({ padding: '12' })).toEqual({
      top: 12, right: 12, bottom: 12, left: 12,
    });
    expect(parseEmbedPadding({ pad: '8' })).toEqual({
      top: 8, right: 8, bottom: 8, left: 8,
    });
  });

  it('parses per-side padding', () => {
    expect(parseEmbedPadding({
      paddingTop: '4',
      paddingRight: '8',
      paddingBottom: '12',
      paddingLeft: '16',
    })).toEqual({ top: 4, right: 8, bottom: 12, left: 16 });
  });

  it('clamps padding to a safe range', () => {
    expect(parseEmbedPadding({ padding: '999' }).top).toBe(64);
    expect(parseEmbedPadding({ padding: '-5' }).top).toBe(0);
  });

  it('defaults to zero padding', () => {
    expect(parseEmbedPadding({})).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it('builds inline padding style', () => {
    expect(embedPaddingStyle({ top: 0, right: 0, bottom: 0, left: 0 })).toBe('');
    expect(embedPaddingStyle({ top: 8, right: 8, bottom: 8, left: 8 })).toBe('padding:8px 8px 8px 8px');
  });

  it('preserves padding query keys', () => {
    expect(embedPaddingQueryString({ padding: '12', page: '2' })).toBe('padding=12');
    expect(embedPaddingQueryString({ paddingTop: '4', paddingLeft: '8' })).toBe('paddingTop=4&paddingLeft=8');
  });

  it('appends padding query to paths', () => {
    expect(appendEmbedPaddingQuery('/embed/threads/x?posted=1', { padding: '12' }))
      .toBe('/embed/threads/x?posted=1&padding=12');
    expect(appendEmbedPaddingQuery('/embed/threads/x', { pad: '8' }))
      .toBe('/embed/threads/x?pad=8');
  });

  it('builds embed thread URLs with default padding', () => {
    expect(buildEmbedThreadUrl('https://forum.example.com', 'thread-1'))
      .toBe(`https://forum.example.com/embed/threads/thread-1?padding=${DEFAULT_EMBED_PADDING_PX}`);
    expect(buildEmbedThreadUrl('https://forum.example.com/', 'thread-1', 0))
      .toBe('https://forum.example.com/embed/threads/thread-1');
  });

  it('builds auto-resize embed snippet', () => {
    const snippet = buildEmbedSnippet(
      'https://forum.example.com',
      'https://forum.example.com/embed/threads/thread-1?padding=16'
    );
    expect(snippet).toContain('class="forum-furiosum-embed"');
    expect(snippet).toContain('scrolling="no"');
    expect(snippet).not.toContain('height="480"');
    expect(snippet).toContain('https://forum.example.com/js/embed-host.js');
  });

  it('uses FORUM_BASE_URL for subpath deployments', () => {
    vi.stubEnv('FORUM_BASE_URL', 'https://revirtualis.net/forum-furiosum');
    vi.stubEnv('BASE_PATH', '/forum-furiosum');

    expect(buildEmbedThreadUrl('https://revirtualis.net', 'thread-1'))
      .toBe(`https://revirtualis.net/forum-furiosum/embed/threads/thread-1?padding=${DEFAULT_EMBED_PADDING_PX}`);

    const snippet = buildEmbedSnippet(
      'https://revirtualis.net',
      `https://revirtualis.net/forum-furiosum/embed/threads/thread-1?padding=${DEFAULT_EMBED_PADDING_PX}`,
    );
    expect(snippet).toContain('https://revirtualis.net/forum-furiosum/js/embed-host.js');
    expect(snippet).not.toContain('https://revirtualis.net/js/embed-host.js');
  });
});
