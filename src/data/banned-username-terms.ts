/** Lowercase substrings; terms are chosen to avoid common false positives (e.g. skip "ass", "hell"). */
export const BANNED_USERNAME_SUBSTRINGS: readonly string[] = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'dick',
  'pussy',
  'whore',
  'slut',
  'asshole',
  'bastard',
  'nigger',
  'faggot',
  'retard',
  'nazi',
  'hitler',
  'porn',
  'rape',
];

/** Reserved identities — exact match or prefix + optional digits only (e.g. admin, admin42). */
export const RESERVED_USERNAMES: readonly string[] = [
  'admin',
  'moderator',
  'mod',
  'support',
  'system',
  'root',
  'official',
  'sysadmin',
  'webmaster',
  'helpdesk',
];
