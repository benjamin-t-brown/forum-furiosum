import Database from 'better-sqlite3';
import crypto from 'crypto';
import { EPHEMERAL_ADJECTIVES, EPHEMERAL_NOUNS } from '../data/ephemeral-word-lists';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidEphemeralClientId(clientId: string): boolean {
  return UUID_V4_REGEX.test(clientId);
}

const EPHEMERAL_SUFFIX_MAX = 999;

function pickRandomWord(pool: readonly string[]): string {
  return pool[crypto.randomInt(0, pool.length)];
}

export function generateEphemeralUsername(db: Database.Database): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const adjective = pickRandomWord(EPHEMERAL_ADJECTIVES);
    const noun = pickRandomWord(EPHEMERAL_NOUNS);
    const number = crypto.randomInt(1, EPHEMERAL_SUFFIX_MAX + 1);
    const username = `${adjective}_${noun}_${number}`;
    if (username.length > 24) {continue;}
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!existing) {return username;}
  }
  throw new Error('Failed to generate unique ephemeral username');
}

export const EPHEMERAL_CLIENT_STORAGE_KEY = 'ff_ephemeral_client_id';
