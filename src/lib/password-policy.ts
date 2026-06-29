/** Matches at least one digit or common symbol character. */
export const PASSWORD_COMPLEXITY_REGEX = /[0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/;

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_ERROR_LENGTH = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
export const PASSWORD_ERROR_COMPLEXITY = 'Password must contain at least one number or symbol';

/**
 * Returns an error message if the password fails policy, or null if it passes.
 */
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return PASSWORD_ERROR_LENGTH;
  if (!PASSWORD_COMPLEXITY_REGEX.test(password)) return PASSWORD_ERROR_COMPLEXITY;
  return null;
}
