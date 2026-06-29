import 'dotenv/config';
import type Database from 'better-sqlite3';
import { getDb } from '../src/db/db';
import { runMigrations } from '../src/db/migrations';
import { bootstrapAdmin } from '../src/services/bootstrap';
import { createUser, getUserByEmail } from '../src/services/auth';
import { createThread } from '../src/services/threads';
import { createPost } from '../src/services/posts';
import type { User } from '../src/models';

const CATEGORY_ID = '00000000-0000-0000-0000-000000000001';
const THREAD_COUNT = 25;
const SEED_USER_COUNT = 25;
const SEED_PASSWORD = 'seed12345';
const TITLE_PREFIX = '[seed] ';

const SEED_USERS = Array.from({ length: SEED_USER_COUNT }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { username: `seed_user_${n}`, email: `seed_user_${n}@example.com` };
});

function parseArgs(argv: string[]): { force: boolean } {
  return { force: argv.includes('--force') };
}

function hasExistingSeed(db: Database.Database): boolean {
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM threads WHERE title LIKE ? AND isDeleted = 0'
  ).get(`${TITLE_PREFIX}%`) as { count: number };
  return row.count > 0;
}

async function ensureSeedUsers(db: Database.Database): Promise<User[]> {
  const users: User[] = [];
  for (const spec of SEED_USERS) {
    const existing = getUserByEmail(db, spec.email);
    if (existing) {
      users.push(existing);
    } else {
      users.push(await createUser(db, spec.username, spec.email, SEED_PASSWORD, 'user', 'verified'));
    }
  }
  return users;
}

function pickAuthor(authors: User[], index: number): User {
  return authors[index % authors.length];
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed production database.');
    process.exit(1);
  }

  const { force } = parseArgs(process.argv.slice(2));
  const db = getDb();
  runMigrations(db);
  await bootstrapAdmin(db);

  const authors = await ensureSeedUsers(db);

  if (!force && hasExistingSeed(db)) {
    console.log(`Ensured ${authors.length} seed users. Threads already present — run with --force to add another batch.`);
    return;
  }

  let threadCount = 0;
  let postCount = 0;

  const seed = db.transaction(() => {
    for (let i = 1; i <= THREAD_COUNT; i++) {
      const author = pickAuthor(authors, i);
      const thread = createThread(db, {
        categoryId: CATEGORY_ID,
        authorUserId: author.id,
        title: `${TITLE_PREFIX}Discussion topic #${i}`,
        body: `Opening post for seeded thread ${i}. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
        approvalStatus: 'approved',
      });
      threadCount++;

      const replyCount = i;
      for (let j = 1; j <= replyCount; j++) {
        const replyAuthor = pickAuthor(authors, i + j);
        createPost(db, {
          threadId: thread.id,
          authorUserId: replyAuthor.id,
          body: `Reply ${j} on thread ${i}. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`,
          approvalStatus: 'approved',
        });
        postCount++;
      }
    }
  });

  seed();

  console.log(`Seeded ${authors.length} users, ${threadCount} threads, and ${postCount} replies.`);
  console.log(`Seed user password: ${SEED_PASSWORD}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
