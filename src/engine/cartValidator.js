/**
 * cartValidator.js
 *
 * Handles validation of cart rows and generates structured parsing logs.
 */

import { parsePrice } from './priceNormalizer.js';
import { LogStatus } from './parserTypes.js';

/**
 * Validates a single cart row.
 *
 * Required fields:
 * - Product
 * - Brand
 * - Platform
 * - Base Price
 *
 * @param {Object} row - The raw cart row extracted from PDF/CSV
 * @param {number} rowNum - The 1-indexed row number
 * @returns {Object} { valid: boolean, item?: Object, log: Object }
 */
export function validateRow(row, rowNum) {
  const product = row.product ? String(row.product).trim() : '';
  const brand = row.brand ? String(row.brand).trim() : '';
  const platform = row.platform ? String(row.platform).trim() : '';
  const rawPrice = row.basePrice !== undefined && row.basePrice !== null ? String(row.basePrice).trim() : '';

  const missing = [];
  if (!product) missing.push('Product');
  if (!brand) missing.push('Brand');
  if (!platform) missing.push('Platform');
  if (!rawPrice) missing.push('Base Price');

  // If any required field is completely missing
  if (missing.length > 0) {
    return {
      valid: false,
      log: {
        rowNum,
        status: LogStatus.SKIPPED,
        message: `Missing required field(s): ${missing.join(', ')}`,
        original: JSON.stringify(row),
        reason: `Missing ${missing.join(', ')}`
      }
    };
  }

  // Validate and parse the price
  try {
    const parsedPrice = parsePrice(rawPrice);
    
    // Check if the price required cleaning/normalization
    const isNormalized = rawPrice !== String(parsedPrice);

    return {
      valid: true,
      item: {
        product,
        brand,
        platform,
        basePrice: parsedPrice
      },
      log: isNormalized
        ? {
            rowNum,
            status: LogStatus.SUCCESS,
            message: `Parsed automatically\nOriginal: ${rawPrice}\nNormalized: ${parsedPrice}`,
            original: rawPrice,
            normalized: String(parsedPrice),
            autoParsed: true
          }
        : {
            rowNum,
            status: LogStatus.SUCCESS,
            message: `Price parsed: ${parsedPrice}`,
            original: rawPrice,
            normalized: String(parsedPrice),
            autoParsed: false
          }
    };
  } catch (err) {
    // Parsing price failed
    return {
      valid: false,
      log: {
        rowNum,
        status: LogStatus.SKIPPED,
        message: `Unable to read price:\n"${rawPrice}"\nSkipped row.`,
        original: rawPrice,
        reason: 'Invalid Base Price'
      }
    };
  }
}
