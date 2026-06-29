import { describe, it, expect } from 'vitest';
import { meetsReplyApprovalTrust, parseReplyApprovalTrust, replyApprovalTrustSelectValue, allowsEphemeralReplies } from '../utils/replyApprovalTrust';

describe('replyApprovalTrust', () => {
  describe('parseReplyApprovalTrust', () => {
    it('parses the UI values', () => {
      expect(parseReplyApprovalTrust('')).toBeNull();
      expect(parseReplyApprovalTrust('verified')).toBe('verified');
      expect(parseReplyApprovalTrust('new')).toBe('new');
      expect(parseReplyApprovalTrust('ephemeral')).toBe('ephemeral');
    });

    it('returns null for invalid values', () => {
      expect(parseReplyApprovalTrust('trusted')).toBeNull();
      expect(parseReplyApprovalTrust('unknown')).toBeNull();
      expect(parseReplyApprovalTrust('invalid')).toBeNull();
    });
  });

  describe('replyApprovalTrustSelectValue', () => {
    it('maps stored values to UI options', () => {
      expect(replyApprovalTrustSelectValue(null)).toBe('');
      expect(replyApprovalTrustSelectValue('trusted')).toBe('');
      expect(replyApprovalTrustSelectValue('verified')).toBe('verified');
      expect(replyApprovalTrustSelectValue('new')).toBe('new');
      expect(replyApprovalTrustSelectValue('ephemeral')).toBe('ephemeral');
    });
  });

  describe('meetsReplyApprovalTrust', () => {
    it('approves users at or above the threshold', () => {
      expect(meetsReplyApprovalTrust('verified', 'trusted')).toBe(true);
      expect(meetsReplyApprovalTrust('trusted', 'trusted')).toBe(true);
      expect(meetsReplyApprovalTrust('new', 'trusted')).toBe(false);
    });

    it('never approves banned users', () => {
      expect(meetsReplyApprovalTrust('banned', 'new')).toBe(false);
    });

    it('does not treat ephemeral as a trust rank threshold', () => {
      expect(meetsReplyApprovalTrust('verified', 'ephemeral')).toBe(false);
      expect(allowsEphemeralReplies('ephemeral')).toBe(true);
    });
  });
});
