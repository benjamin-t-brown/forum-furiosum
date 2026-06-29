export const MIN_POST_BODY_LENGTH = 1;
export const MAX_POST_BODY_LENGTH = 2500;

export function getPostBodyValidationError(body: string): string | null {
  if (body.length < MIN_POST_BODY_LENGTH) {
    return 'Post body is required';
  }
  if (body.length > MAX_POST_BODY_LENGTH) {
    return `Post body must be at most ${MAX_POST_BODY_LENGTH} characters`;
  }
  return null;
}
