import { describe, it, expect } from 'vitest';
import { parseNotifyArgs } from '../services/forumNotifyRunner';

describe('notify script args', () => {
  it('parses dry-run and event type overrides', () => {
    expect(parseNotifyArgs(['--dry-run', '--types=approval_required,comment_created'])).toEqual({
      dryRun: true,
      help: false,
      eventTypes: ['approval_required', 'comment_created'],
    });
  });

  it('requests help', () => {
    expect(parseNotifyArgs(['--help'])).toEqual({
      dryRun: false,
      help: true,
      eventTypes: undefined,
    });
  });
});
