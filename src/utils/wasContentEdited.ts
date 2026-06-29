/** True when content was edited after the original publish time. */
export function wasContentEdited(createdAt: string, lastEditedAt: string | null): boolean {
  if (!lastEditedAt) {return false;}
  return lastEditedAt > createdAt;
}
