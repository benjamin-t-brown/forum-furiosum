import {
  BANNED_USERNAME_SUBSTRINGS,
  RESERVED_USERNAMES,
} from '../data/banned-username-terms';

export const USERNAME_REGEX = /^[A-Za-z0-9_]{3,24}$/;

export function isReservedUsername(username: string): boolean {
  const lower = username.toLowerCase();
  for (const reserved of RESERVED_USERNAMES) {
    if (lower === reserved) {return true;}
    if (lower.startsWith(reserved)) {
      const suffix = lower.slice(reserved.length);
      if (suffix === '' || /^\d+$/.test(suffix)) {return true;}
    }
  }
  return false;
}

export function containsBannedUsernameTerm(username: string): boolean {
  const lower = username.toLowerCase();
  return BANNED_USERNAME_SUBSTRINGS.some((term) => lower.includes(term));
}

/** Returns a user-facing error message, or null if the username is allowed. */
export function getUsernameValidationError(username: string): string | null {
  const trimmed = username.trim();
  if (!USERNAME_REGEX.test(trimmed)) {
    return 'Username must be 3–24 characters (letters, numbers, and underscores only)';
  }
  if (isReservedUsername(trimmed)) {
    return 'That username is reserved';
  }
  if (containsBannedUsernameTerm(trimmed)) {
    return 'That username is not allowed';
  }
  return null;
}

export function isValidUsername(username: string): boolean {
  return getUsernameValidationError(username) === null;
}
