/**
 * priceNormalizer.js
 *
 * Provides a production-grade utility for parsing and normalizing price inputs.
 */

/**
 * Normalizes and parses raw text into a valid positive integer price.
 *
 * Requirements:
 * - Remove "Rs.", "Rs", "₹" (case-insensitive)
 * - Remove commas and extra spaces
 * - Convert to Number
 * - Reject invalid values (empty, non-numeric, negative, NaN)
 * - Never return NaN
 *
 * @param {any} value
 * @returns {number}
 * @throws {Error} if the value is invalid or cannot be parsed
 */
export function parsePrice(value) {
  if (value === undefined || value === null) {
    throw new Error('Price value is missing');
  }

  // Convert to string and clean
  let clean = String(value).trim();
  if (clean === '') {
    throw new Error('Price value is empty');
  }

  // Remove currency signs, prefixes and commas
  clean = clean.replace(/rs\.?/gi, '');
  clean = clean.replace(/₹/g, '');
  clean = clean.replace(/,/g, '');
  clean = clean.trim();

  if (clean === '') {
    throw new Error('Price value contains only currency symbols');
  }

  // Parse to number
  const num = Number(clean);

  // Validate number
  if (isNaN(num)) {
    throw new Error(`Invalid price number format: "${value}"`);
  }
  if (num < 0) {
    throw new Error(`Price cannot be negative: ${num}`);
  }

  return Math.round(num);
}
