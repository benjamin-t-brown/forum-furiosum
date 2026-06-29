export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'moderator' | 'user';
  trust: 'new' | 'unknown' | 'trusted' | 'verified' | 'banned';
  isDeleted: 0 | 1;
  theme: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isHidden: 0 | 1;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  categoryId: string;
  authorUserId: string;
  title: string;
  body: string;
  approvalStatus: 'new' | 'approved' | 'unapproved' | 'unknown';
  isHidden: 0 | 1;
  isDeleted: 0 | 1;
  isLocked: 0 | 1;
  createdAt: string;
  updatedAt: string;
  lastEditedAt: string | null;
  lastEditedByUserId: string | null;
  lastEditedReason: string | null;
  embedEnabled: 0 | 1;
  replyApprovalTrust: ReplyApprovalTrust | null;
}

export interface Post {
  id: string;
  threadId: string;
  authorUserId: string;
  body: string;
  approvalStatus: 'new' | 'approved' | 'unapproved' | 'unknown';
  isHidden: 0 | 1;
  isDeleted: 0 | 1;
  createdAt: string;
  updatedAt: string;
  lastEditedAt: string | null;
  lastEditedByUserId: string | null;
  lastEditedReason: string | null;
}

export interface Session {
  sessionId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  ipHash: string | null;
  userAgentHash: string | null;
}

export interface ModerationAuditLog {
  id: string;
  actorUserId: string;
  targetType: 'user' | 'thread' | 'post';
  targetId: string;
  action: string;
  reason: string | null;
  createdAt: string;
}

export interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

// Pagination helper type
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Extended types for UI/API responses
export type UserRole = 'admin' | 'moderator' | 'user';
export type UserTrust = 'new' | 'unknown' | 'trusted' | 'verified' | 'banned';
export type ReplyApprovalTrust = 'new' | 'unknown' | 'trusted' | 'verified';
export type ApprovalStatus = 'new' | 'approved' | 'unapproved' | 'unknown';
export type TargetType = 'user' | 'thread' | 'post';
