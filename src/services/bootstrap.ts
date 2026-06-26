import Database from 'better-sqlite3';
import { createUser, getUserByEmail } from './auth';
import logger from '../logger';

export async function bootstrapAdmin(db: Database.Database): Promise<void> {
  const env = process.env.NODE_ENV ?? 'development';

  let email: string;
  let password: string;
  let username: string;

  if (env === 'development') {
    email = process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@admin.com';
    password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'test12345';
    username = process.env.ADMIN_BOOTSTRAP_USERNAME ?? 'admin';
  } else {
    // Production: require env vars
    email = process.env.ADMIN_BOOTSTRAP_EMAIL ?? '';
    password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? '';
    username = process.env.ADMIN_BOOTSTRAP_USERNAME ?? 'admin';

    if (!email || !password) {
      throw new Error('ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must be set in production');
    }

    // Reject obviously weak/default credentials in production
    const unsafe = ['test12345', 'password', 'admin', 'admin123', '123456'];
    if (unsafe.includes(password)) {
      throw new Error('ADMIN_BOOTSTRAP_PASSWORD is unsafe for production use');
    }
    if (email === 'admin@admin.com') {
      throw new Error('ADMIN_BOOTSTRAP_EMAIL uses an unsafe default for production');
    }
  }

  const existing = getUserByEmail(db, email);
  if (!existing) {
    await createUser(db, username, email, password, 'admin');
    logger.info({ email, username }, 'Admin account bootstrapped');
  }
}
