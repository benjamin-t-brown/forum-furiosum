import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from './helpers/db';
import { createUser, getUserByEmail } from '../services/auth';
import { bootstrapAdmin } from '../services/bootstrap';

describe('bootstrapAdmin', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_BOOTSTRAP_EMAIL', 'bootstrap@example.com');
    vi.stubEnv('ADMIN_BOOTSTRAP_PASSWORD', 'test12345');
    vi.stubEnv('ADMIN_BOOTSTRAP_USERNAME', 'bootstrapadmin');
  });

  it('creates a verified admin account when none exists', async () => {
    await bootstrapAdmin(db);

    const admin = getUserByEmail(db, 'bootstrap@example.com');
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe('admin');
    expect(admin!.trust).toBe('verified');
  });

  it('upgrades an existing bootstrap admin from new to verified', async () => {
    await createUser(db, 'bootstrapadmin', 'bootstrap@example.com', 'test12345', 'admin', 'new');

    await bootstrapAdmin(db);

    const admin = getUserByEmail(db, 'bootstrap@example.com');
    expect(admin!.trust).toBe('verified');
  });

  it('upgrades an existing bootstrap admin from trusted to verified', async () => {
    await createUser(db, 'bootstrapadmin', 'bootstrap@example.com', 'test12345', 'admin', 'trusted');

    await bootstrapAdmin(db);

    const admin = getUserByEmail(db, 'bootstrap@example.com');
    expect(admin!.trust).toBe('verified');
  });
});
