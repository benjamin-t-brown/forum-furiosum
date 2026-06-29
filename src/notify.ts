import 'dotenv/config';
import { runForumNotifyFromEnv } from './services/forumNotifyRunner';

export async function runNotifyCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  await runForumNotifyFromEnv(argv);
}

if (require.main === module) {
  runNotifyCli().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
