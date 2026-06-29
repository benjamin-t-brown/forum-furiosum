import { describe, it, expect } from 'vitest';
import { meetsReplyApprovalTrust, parseReplyApprovalTrust, replyApprovalTrustSelectValue } from '../utils/replyApprovalTrust';

describe('replyApprovalTrust', () => {
  describe('parseReplyApprovalTrust', () => {
    it('parses the three UI values', () => {
      expect(parseReplyApprovalTrust('')).toBeNull();
      expect(parseReplyApprovalTrust('verified')).toBe('verified');
      expect(parseReplyApprovalTrust('new')).toBe('new');
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
  });
});
