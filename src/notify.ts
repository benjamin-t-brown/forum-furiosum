import 'dotenv/config';
import { runForumNotifyFromEnv } from './services/forumNotifyRunner';

runForumNotifyFromEnv().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
