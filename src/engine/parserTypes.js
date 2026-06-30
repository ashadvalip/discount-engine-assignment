/**
 * parserTypes.js
 *
 * JSDoc definitions and structural constants for the PDF Ingestion Pipeline.
 */

/**
 * @typedef {Object} RawCartRow
 * @property {string} product - Raw product name
 * @property {string} brand - Raw brand name
 * @property {string} platform - Raw platform name
 * @property {string|number} basePrice - Raw price string or number
 * @property {number} rowNum - 1-indexed row number from PDF
 */

/**
 * @typedef {Object} CartItem
 * @property {string} itemId - Generated ID (e.g. ITEM-01)
 * @property {string} product
 * @property {string} brand
 * @property {string} platform
 * @property {number} basePrice - Parsed positive integer price
 */

/**
 * @typedef {Object} IngestionLog
 * @property {number} rowNum - 1-indexed row number
 * @property {string} status - 'success' | 'warning' | 'skipped'
 * @property {string} message - User-friendly message
 * @property {string} [original] - Original price or row text
 * @property {string} [normalized] - Normalized price value
 */

export const LogStatus = {
  SUCCESS: 'success',
  WARNING: 'warning',
  SKIPPED: 'skipped'
};
