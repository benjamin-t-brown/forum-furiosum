import Database from 'better-sqlite3';

export interface ForumSettings {
  forumName: string;
  homeIntro: string;
  topBarLinks: Array<{ label: string; url: string }>;
  featuredCategories: string[];
  themeColorPrimary: string;
  themeColorAccent: string;
  themeColorSurface: string;
}

export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updatedAt = excluded.updatedAt
  `).run(key, value);
}

export function getAllSettings(db: Database.Database): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export function getForumSettings(db: Database.Database): ForumSettings {
  const raw = getAllSettings(db);

  let topBarLinks: ForumSettings['topBarLinks'] = [];
  try { topBarLinks = JSON.parse(raw.topBarLinks ?? '[]'); } catch { topBarLinks = []; }

  let featuredCategories: string[] = [];
  try { featuredCategories = JSON.parse(raw.featuredCategories ?? '[]'); } catch { featuredCategories = []; }

  return {
    forumName: raw.forumName ?? 'Forum Furiosum',
    homeIntro: raw.homeIntro ?? '',
    topBarLinks,
    featuredCategories,
    themeColorPrimary: raw.themeColorPrimary ?? '#a8cbe1',
    themeColorAccent: raw.themeColorAccent ?? '#b02e0c',
    themeColorSurface: raw.themeColorSurface ?? '#ebeae6',
  };
}

export function updateForumSettings(db: Database.Database, data: Partial<ForumSettings>): void {
  if (data.forumName !== undefined) {setSetting(db, 'forumName', data.forumName);}
  if (data.homeIntro !== undefined) {setSetting(db, 'homeIntro', data.homeIntro);}
  if (data.topBarLinks !== undefined) {setSetting(db, 'topBarLinks', JSON.stringify(data.topBarLinks));}
  if (data.featuredCategories !== undefined) {setSetting(db, 'featuredCategories', JSON.stringify(data.featuredCategories));}
  if (data.themeColorPrimary !== undefined) {setSetting(db, 'themeColorPrimary', data.themeColorPrimary);}
  if (data.themeColorAccent !== undefined) {setSetting(db, 'themeColorAccent', data.themeColorAccent);}
  if (data.themeColorSurface !== undefined) {setSetting(db, 'themeColorSurface', data.themeColorSurface);}
}
