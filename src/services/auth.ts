import argon2 from 'argon2';
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { User, UserTrust } from '../models';

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export async function createUser(
  db: Database.Database,
  username: string,
  email: string,
  password: string,
  role: 'admin' | 'moderator' | 'user' = 'user',
  trust?: UserTrust
): Promise<User> {
  const id = uuidv4();
  const passwordHash = await hashPassword(password);
  const normalizedEmail = email.toLowerCase().trim();
  const resolvedTrust = trust ?? (
    role === 'admin' ? 'verified' : role === 'moderator' ? 'trusted' : 'new'
  );

  db.prepare(`
    INSERT INTO users (id, username, email, passwordHash, role, trust)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, username, normalizedEmail, passwordHash, role, resolvedTrust);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
}

// Login by username or email
export async function loginUser(
  db: Database.Database,
  usernameOrEmail: string,
  password: string
): Promise<User | null> {
  const normalized = usernameOrEmail.toLowerCase().trim();
  const user = db.prepare(
    'SELECT * FROM users WHERE (email = ? OR LOWER(username) = ?) AND isDeleted = 0'
  ).get(normalized, normalized) as User | undefined;

  if (!user) {return null;}

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {return null;}

  // Update lastLoginAt
  db.prepare("UPDATE users SET lastLoginAt = datetime('now') WHERE id = ?").run(user.id);

  return user;
}

export function getUserById(db: Database.Database, id: string): User | null {
  return (db.prepare('SELECT * FROM users WHERE id = ? AND isDeleted = 0').get(id) as User | undefined) ?? null;
}

export function getUserByUsername(db: Database.Database, username: string): User | null {
  return (db.prepare('SELECT * FROM users WHERE LOWER(username) = ? AND isDeleted = 0').get(username.toLowerCase()) as User | undefined) ?? null;
}

export function getUserByEmail(db: Database.Database, email: string): User | null {
  return (db.prepare('SELECT * FROM users WHERE email = ? AND isDeleted = 0').get(email.toLowerCase()) as User | undefined) ?? null;
}
