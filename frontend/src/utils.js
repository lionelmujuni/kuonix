// ── Pure utilities shared across modules ──────────────────────────────────────

/**
 * Convert a raw issue key (e.g. "Needs_Exposure") to a short human-readable label.
 * @param {string} issue
 * @returns {string}
 */
export function formatIssueName(issue) {
  return issue
    .replace(/_/g, ' ')
    .replace(/Needs /g, '')
    .replace(/Oversaturated/g, 'Oversat')
    .replace(/ColorCast/g, 'Cast')
    .replace(/SkinTone/g, 'Skin');
}

/**
 * Format a byte count as a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k     = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i     = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
