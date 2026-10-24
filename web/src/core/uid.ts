/**
 * Generates a unique identifier with an optional prefix.
 * Matches legacy `CC.uid` in legacy/index.html L441.
 */
export function uid(prefix?: string): string {
  return (prefix || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
