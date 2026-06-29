import type { UserRole } from '../models';

type LockViewer = { role: UserRole } | null | undefined;

export function isStaff(role: UserRole): boolean {
  return role === 'admin' || role === 'moderator';
}

export function canPostToThread(threadLocked: boolean, viewer: LockViewer): boolean {
  if (!threadLocked) {
    return true;
  }
  return viewer != null && isStaff(viewer.role);
}

export function canEditPostOnThread(
  threadLocked: boolean,
  viewer: LockViewer,
  postAuthorUserId: string,
  viewerUserId?: string,
): boolean {
  if (!viewer || !viewerUserId) {
    return false;
  }

  const staff = isStaff(viewer.role);
  if (staff) {
    return true;
  }

  if (viewerUserId !== postAuthorUserId) {
    return false;
  }

  return !threadLocked;
}
