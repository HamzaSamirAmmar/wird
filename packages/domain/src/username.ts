// Employees log in with a username + password; Supabase Auth needs an email internally.
// We deterministically derive one from the username so there's no server lookup at login time
// and the concept of "email" never surfaces in any UI.

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,32}$/;
const SYNTHETIC_EMAIL_DOMAIN = 'wird.local';

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(raw));
}

export function usernameToSyntheticEmail(username: string): string {
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized)) {
    throw new Error(`Invalid username: ${username}`);
  }
  return `${normalized}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
