import { runCleanupEphemeral } from '../src/cleanup-ephemeral';

runCleanupEphemeral().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
