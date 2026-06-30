import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from './helpers/db';
import { getSetting, setSetting, getAllSettings, getForumSettings, updateForumSettings } from '../services/settings';

describe('Settings service', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('reads a seeded setting', () => {
    expect(getSetting(db, 'forumName')).toBe('Forum Furiosum');
  });

  it('sets and gets a custom setting', () => {
    setSetting(db, 'forumName', 'My Forum');
    expect(getSetting(db, 'forumName')).toBe('My Forum');
  });

  it('returns null for missing setting', () => {
    expect(getSetting(db, 'nonexistent')).toBeNull();
  });

  it('getAllSettings returns all key/value pairs', () => {
    const all = getAllSettings(db);
    expect(all.forumName).toBe('Forum Furiosum');
    expect(all.topBarLinks).toBe('[]');
  });

  it('getForumSettings returns typed settings', () => {
    const settings = getForumSettings(db);
    expect(settings.forumName).toBe('Forum Furiosum');
    expect(Array.isArray(settings.topBarLinks)).toBe(true);
    expect(Array.isArray(settings.featuredCategories)).toBe(true);
    expect(settings.themeColorPrimary).toBe('#b3cfdf');
    expect(settings.themeColorSurface).toBe('#ebeae6');
  });

  it('updateForumSettings persists changes', () => {
    updateForumSettings(db, {
      forumName: 'Updated Forum',
      homeIntro: 'Welcome to our forum. Be kind.',
      topBarLinks: [{ label: 'Blog', url: 'https://example.com' }],
    });
    const settings = getForumSettings(db);
    expect(settings.forumName).toBe('Updated Forum');
    expect(settings.homeIntro).toBe('Welcome to our forum. Be kind.');
    expect(settings.topBarLinks[0].label).toBe('Blog');
  });
});
