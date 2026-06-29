import { normalizeFormString } from './normalizeLineEndings';

const DEFAULT_SKIP_KEYS = new Set([
  'password',
  'confirmPassword',
  'currentPassword',
  'newPassword',
]);

/** Recursively trims string values in form payloads. Password fields are left unchanged. */
export function trimFormStrings<T>(
  value: T,
  skipKeys: ReadonlySet<string> = DEFAULT_SKIP_KEYS,
): T {
  if (typeof value === 'string') {
    return normalizeFormString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => trimFormStrings(item, skipKeys)) as T;
  }

  if (value && typeof value === 'object') {
    const result = { ...value } as Record<string, unknown>;
    for (const [key, val] of Object.entries(result)) {
      if (skipKeys.has(key)) {continue;}
      result[key] = trimFormStrings(val, skipKeys);
    }
    return result as T;
  }

  return value;
}
