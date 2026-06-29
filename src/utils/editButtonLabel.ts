import type { UserRole } from '../models';

type EditViewer = { id: string; role: UserRole };

/** Label for thread/post edit actions: owners see "Edit"; staff see "Admin Edit" / "Mod Edit" on others' content. */
export function editButtonLabel(
  user: EditViewer | null | undefined,
  authorUserId: string,
  options?: { threadLocked?: boolean },
): string | null {
  if (!user) {
    return null;
  }

  const isOwner = user.id === authorUserId;
  const isStaff = user.role === 'admin' || user.role === 'moderator';

  if (!isOwner && !isStaff) {
    return null;
  }

  if (options?.threadLocked && !isStaff) {
    return null;
  }

  if (isOwner) {
    return 'Edit';
  }

  return user.role === 'admin' ? 'Admin Edit' : 'Mod Edit';
}
