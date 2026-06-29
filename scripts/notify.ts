// Dev entrypoint for `npm run notify` (tsx). Production/Docker: node dist/notify.js
import { runNotifyCli } from '../src/notify';

runNotifyCli().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
