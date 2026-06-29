import type { UserTrust } from '../models';

export const REPLY_APPROVAL_TRUST_VALUES = ['new', 'unknown', 'trusted', 'verified'] as const;
export type ReplyApprovalTrust = (typeof REPLY_APPROVAL_TRUST_VALUES)[number];

export type ReplyApprovalTrustSelectValue = '' | 'new' | 'verified';

const TRUST_RANK: Record<Exclude<UserTrust, 'banned'>, number> = {
  new: 0,
  unknown: 1,
  trusted: 2,
  verified: 3,
};

export const REPLY_APPROVAL_TRUST_OPTIONS: { value: ReplyApprovalTrustSelectValue; label: string }[] = [
  { value: '', label: 'Trusted & Verified' },
  { value: 'verified', label: 'Verified Only' },
  { value: 'new', label: 'Any (not banned)' },
];

/** Maps stored thread values to the three UI options. */
export function replyApprovalTrustSelectValue(value: ReplyApprovalTrust | null): ReplyApprovalTrustSelectValue {
  if (value === 'new') {return 'new';}
  if (value === 'verified') {return 'verified';}
  return '';
}

export function parseReplyApprovalTrust(value: unknown): ReplyApprovalTrust | null {
  if (value === '' || value === undefined || value === null) {return null;}
  if (value === 'new' || value === 'verified') {return value;}
  return null;
}

export function meetsReplyApprovalTrust(userTrust: UserTrust, threshold: ReplyApprovalTrust): boolean {
  if (userTrust === 'banned') {return false;}
  return TRUST_RANK[userTrust] >= TRUST_RANK[threshold];
}
