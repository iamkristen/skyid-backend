// utils/string.utils.ts
// String utilities used across the backend. Keeps helpers centralized and consistent.

export function capitalize(input: string, locale?: string): string {
  // Return as-is for empty, nullish, or non-string values
  if (input == null) return "";
  if (input.length === 0) return "";

  // Decide whether to trim or preserve spaces:
  // - Trimming avoids accidental leading/trailing spaces affecting the first char.
  // - If you must preserve spaces, remove the trim and adjust index finding.
  const s = input.trim();

  if (s.length === 0) return "";

  // Use locale-aware casing to respect languages like Turkish.
  const first = s.charAt(0).toLocaleUpperCase(locale);
  const rest = s.slice(1).toLocaleLowerCase(locale);

  return first + rest;
}

/**
 * Capitalize every word (Title Case-ish), keeping the rest lowercase.
 * Note: This is a simple rule; customize small words list if needed.
 */
export function capitalizeWords(input: string, locale?: string): string {
  if (input == null) return "";
  const s = input.trim();
  if (s.length === 0) return "";

  return s
    .split(/\s+/)
    .map((word) => {
      const first = word.charAt(0).toLocaleUpperCase(locale);
      const rest = word.slice(1).toLocaleLowerCase(locale);
      return first + rest;
    })
    .join(" ");
}
