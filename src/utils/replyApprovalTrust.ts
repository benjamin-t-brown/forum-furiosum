import type { UserTrust } from '../models';

export const REPLY_APPROVAL_TRUST_VALUES = ['new', 'unknown', 'trusted', 'verified', 'ephemeral'] as const;
export type ReplyApprovalTrust = (typeof REPLY_APPROVAL_TRUST_VALUES)[number];

export type ReplyApprovalTrustSelectValue = '' | 'new' | 'verified' | 'ephemeral';

const TRUST_RANK: Record<Exclude<UserTrust, 'banned'>, number> = {
  new: 0,
  unknown: 1,
  trusted: 2,
  verified: 3,
};

export const REPLY_APPROVAL_TRUST_OPTIONS: { value: ReplyApprovalTrustSelectValue; label: string }[] = [
  { value: '', label: 'Trusted & Verified' },
  { value: 'verified', label: 'Verified Only' },
  { value: 'new', label: 'Any logged in' },
  { value: 'ephemeral', label: 'Ephemeral (no login)' },
];

/** Maps stored thread values to the four UI options. */
export function replyApprovalTrustSelectValue(value: ReplyApprovalTrust | null): ReplyApprovalTrustSelectValue {
  if (value === 'new') {return 'new';}
  if (value === 'verified') {return 'verified';}
  if (value === 'ephemeral') {return 'ephemeral';}
  return '';
}

export function parseReplyApprovalTrust(value: unknown): ReplyApprovalTrust | null {
  if (value === '' || value === undefined || value === null) {return null;}
  if (value === 'new' || value === 'verified' || value === 'ephemeral') {return value;}
  return null;
}

export function allowsEphemeralReplies(replyApprovalTrust: ReplyApprovalTrust | null | undefined): boolean {
  return replyApprovalTrust === 'ephemeral';
}

export function meetsReplyApprovalTrust(userTrust: UserTrust, threshold: ReplyApprovalTrust): boolean {
  if (userTrust === 'banned') {return false;}
  if (threshold === 'ephemeral') {return false;}
  return TRUST_RANK[userTrust] >= TRUST_RANK[threshold];
}
