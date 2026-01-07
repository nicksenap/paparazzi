/**
 * Screenshot constants.
 */

/**
 * Maximum dimension for images sent to Claude API.
 * Using 7000 to be conservative (actual limit is 8000px).
 */
export const MAX_IMAGE_DIMENSION = 7000;

/**
 * Delay between scroll and capture to allow content to settle.
 */
export const SCROLL_SETTLE_DELAY = 300;

/**
 * Minimum interval between captures to avoid Chrome rate limiting.
 */
export const MIN_CAPTURE_INTERVAL = 500;

/**
 * Timeout for waiting for images to load.
 */
export const IMAGE_LOAD_TIMEOUT = 2000;
