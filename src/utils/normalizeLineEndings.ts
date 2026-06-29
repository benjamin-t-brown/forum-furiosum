/** Normalizes Windows and legacy Mac line endings to LF. */
export function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

/** Trims outer whitespace and normalizes line endings for form text fields. */
export function normalizeFormString(value: string): string {
  return normalizeLineEndings(value).trim();
}
