import transliterate from '@sindresorhus/transliterate';
import { isValidUsername } from '@wird/domain';

/**
 * Suggests a valid username from a full name (Arabic or English).
 *
 * Examples:
 *   'أحمد علي'     → 'ahmd_aly'
 *   'محمد الحسن'   → 'mhmd_alhsn'
 *   'John Doe'     → 'john_doe'
 *   'عبد الله'      → 'abd_allh'
 *
 * The result is always lowercased, spaces become underscores,
 * and any characters outside [a-z0-9_] are stripped.
 * Returns empty string if the name produces nothing valid.
 */
export function suggestUsername(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';

  // Transliterate (handles Arabic → Latin, plus passthrough for English)
  const latin = transliterate(trimmed);

  // Normalize: lowercase, spaces → underscores, strip invalid chars
  const suggested = latin
    .toLowerCase()
    .replace(/\s+/g, '_') // spaces → underscores
    .replace(/[^a-z0-9_]/g, '') // strip everything not allowed
    .replace(/_+/g, '_') // collapse consecutive underscores
    .replace(/^_|_$/g, ''); // trim leading/trailing underscores

  // Truncate to max 32 chars
  const truncated = suggested.slice(0, 32);

  // Only return if it passes validation (≥3 chars)
  return isValidUsername(truncated) ? truncated : suggested.slice(0, 32);
}
