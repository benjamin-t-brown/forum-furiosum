import { describe, it, expect } from 'vitest';
import {
  getUsernameValidationError,
  isReservedUsername,
  containsBannedUsernameTerm,
} from '../utils/usernameValidation';

describe('usernameValidation', () => {
  describe('getUsernameValidationError', () => {
    it('accepts valid usernames with letters, numbers, and underscores', () => {
      expect(getUsernameValidationError('alice')).toBeNull();
      expect(getUsernameValidationError('adminuser')).toBeNull();
      expect(getUsernameValidationError('User123')).toBeNull();
      expect(getUsernameValidationError('cool_name')).toBeNull();
    });

    it('rejects invalid format', () => {
      expect(getUsernameValidationError('ab')).toContain('3–24');
      expect(getUsernameValidationError('bad-name')).toContain('3–24');
      expect(getUsernameValidationError('user@host')).toContain('3–24');
    });

    it('rejects reserved usernames', () => {
      expect(getUsernameValidationError('admin')).toBe('That username is reserved');
      expect(getUsernameValidationError('Admin42')).toBe('That username is reserved');
      expect(getUsernameValidationError('moderator')).toBe('That username is reserved');
      expect(getUsernameValidationError('mod99')).toBe('That username is reserved');
    });

    it('rejects banned terms without revealing the match', () => {
      expect(getUsernameValidationError('xfuckx')).toBe('That username is not allowed');
      expect(getUsernameValidationError('shithead')).toBe('That username is not allowed');
    });

    it('allows names that do not contain banned substrings', () => {
      expect(getUsernameValidationError('classic')).toBeNull();
      expect(getUsernameValidationError('hello')).toBeNull();
      expect(getUsernameValidationError('bassplayer')).toBeNull();
    });
  });

  describe('isReservedUsername', () => {
    it('blocks reserved names and numeric suffixes only', () => {
      expect(isReservedUsername('support')).toBe(true);
      expect(isReservedUsername('support7')).toBe(true);
      expect(isReservedUsername('supportteam')).toBe(false);
    });
  });

  describe('containsBannedUsernameTerm', () => {
    it('detects configured substrings case-insensitively', () => {
      expect(containsBannedUsernameTerm('FuCkOff')).toBe(true);
      expect(containsBannedUsernameTerm('niceguy')).toBe(false);
    });
  });
});
