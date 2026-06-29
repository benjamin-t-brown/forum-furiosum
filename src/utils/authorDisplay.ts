export const REDACTED_USERNAME = '[deleted]';

export const USERNAME_REGEX = /^[A-Za-z0-9]{3,24}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

/** SQL fragment: resolved display name for a joined users row aliased as `u`. */
export const AUTHOR_USERNAME_SQL = `CASE WHEN u.isDeleted = 1 THEN '${REDACTED_USERNAME}' ELSE u.username END as authorUsername`;

/** SQL fragment: whether the joined author account is deleted. */
export const AUTHOR_IS_DELETED_SQL = 'u.isDeleted as authorIsDeleted';

/** SQL fragment: trust level for the joined author row aliased as `u`. */
export const AUTHOR_TRUST_SQL = 'u.trust as authorTrust';

/** SQL fragment: resolved display name for editor joined as `editor` (nullable). */
export const EDITOR_USERNAME_SQL = `CASE WHEN editor.id IS NULL THEN NULL WHEN editor.isDeleted = 1 THEN '${REDACTED_USERNAME}' ELSE editor.username END as editorUsername`;

/** SQL fragment: whether the joined editor account is deleted (nullable when no editor). */
export const EDITOR_IS_DELETED_SQL = 'editor.isDeleted as editorIsDeleted';

export function redactedUsernameForId(userId: string): string {
  return `${REDACTED_USERNAME}-${userId.slice(0, 8)}`;
}

export function redactedEmailForId(userId: string): string {
  return `deleted+${userId}@invalid.local`;
}
