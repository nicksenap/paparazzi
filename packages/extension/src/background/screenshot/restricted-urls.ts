/**
 * URL restriction checking - pure function, no Chrome dependencies.
 */

/**
 * Restricted URL prefixes that cannot be captured.
 */
export const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'edge://',
  'about:',
  'view-source:',
  'devtools://',
];

/**
 * Check if a URL is restricted for screenshot capture.
 */
export function isRestrictedUrl(url: string): boolean {
  return RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix));
}
