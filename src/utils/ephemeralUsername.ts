import Database from 'better-sqlite3';
import crypto from 'crypto';
import { EPHEMERAL_ADJECTIVES, EPHEMERAL_NOUNS } from '../data/ephemeral-word-lists';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidEphemeralClientId(clientId: string): boolean {
  return UUID_V4_REGEX.test(clientId);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const EPHEMERAL_SUFFIX_MAX = 999;

function pickUnusedWord(
  db: Database.Database,
  kind: 'adjective' | 'noun',
  pool: readonly string[]
): string {
  const date = todayDate();
  const used = new Set(
    (db.prepare('SELECT word FROM ephemeral_name_usage WHERE date = ? AND kind = ?').all(date, kind) as { word: string }[])
      .map((r) => r.word)
  );
  const available = pool.filter((w) => !used.has(w) && !/\d{4,}/.test(w));
  const source = available.length > 0 ? available : pool.filter((w) => !/\d{4,}/.test(w));
  const word = source[crypto.randomInt(0, source.length)];
  db.prepare('INSERT OR IGNORE INTO ephemeral_name_usage (date, word, kind) VALUES (?, ?, ?)').run(date, word, kind);
  return word;
}

export function generateEphemeralUsername(db: Database.Database): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const adjective = pickUnusedWord(db, 'adjective', EPHEMERAL_ADJECTIVES);
    const noun = pickUnusedWord(db, 'noun', EPHEMERAL_NOUNS);
    const number = crypto.randomInt(1, EPHEMERAL_SUFFIX_MAX + 1);
    const username = `${adjective}_${noun}_${number}`;
    if (username.length > 24) {continue;}
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!existing) {return username;}
  }
  throw new Error('Failed to generate unique ephemeral username');
}

export const EPHEMERAL_CLIENT_STORAGE_KEY = 'ff_ephemeral_client_id';
