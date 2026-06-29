import { runClearNotifyState } from '../src/clear-notify-state';

try {
  runClearNotifyState();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
