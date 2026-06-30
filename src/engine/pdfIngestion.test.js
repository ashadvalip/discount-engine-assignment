import { describe, it, expect } from 'vitest';
import { parsePrice } from './priceNormalizer.js';
import { validateRow } from './cartValidator.js';
import { LogStatus } from './parserTypes.js';

describe('Price Normalizer - parsePrice', () => {
  it('should parse simple integers', () => {
    expect(parsePrice('7999')).toBe(7999);
  });

  it('should normalize Rs. prefix and commas', () => {
    expect(parsePrice('Rs.1,299')).toBe(1299);
  });

  it('should normalize ₹ symbol and commas', () => {
    expect(parsePrice('₹2,499')).toBe(2499);
  });

  it('should normalize Rs prefix without dot', () => {
    expect(parsePrice('Rs 899')).toBe(899);
  });

  it('should normalize numbers with commas', () => {
    expect(parsePrice('7,999')).toBe(7999);
  });

  it('should reject non-numeric values and throw errors', () => {
    expect(() => parsePrice('ABC')).toThrow();
    expect(() => parsePrice('Rs. ABC')).toThrow();
  });

  it('should reject empty or missing values', () => {
    expect(() => parsePrice('')).toThrow();
    expect(() => parsePrice('   ')).toThrow();
    expect(() => parsePrice(null)).toThrow();
    expect(() => parsePrice(undefined)).toThrow();
  });

  it('should reject negative values', () => {
    expect(() => parsePrice('-120')).toThrow();
    expect(() => parsePrice('Rs.-500')).toThrow();
  });
});

describe('Cart Validator - validateRow', () => {
  it('should pass valid rows and log success', () => {
    const validRow = {
      product: 'Gaming Chair',
      brand: 'ErgoSeat',
      platform: 'Amazon India',
      basePrice: '7999'
    };
    const result = validateRow(validRow, 2);
    expect(result.valid).toBe(true);
    expect(result.item.basePrice).toBe(7999);
    expect(result.log.status).toBe(LogStatus.SUCCESS);
  });

  it('should automatically parse and log normalized prices', () => {
    const row = {
      product: 'Gaming Chair',
      brand: 'ErgoSeat',
      platform: 'Amazon India',
      basePrice: 'Rs.1,299'
    };
    const result = validateRow(row, 3);
    expect(result.valid).toBe(true);
    expect(result.item.basePrice).toBe(1299);
    expect(result.log.status).toBe(LogStatus.SUCCESS);
    expect(result.log.autoParsed).toBe(true);
    expect(result.log.message).toContain('Parsed automatically');
  });

  it('should reject rows with missing fields', () => {
    const row = {
      product: 'Gaming Chair',
      platform: 'Amazon India',
      basePrice: '7999'
      // missing brand
    };
    const result = validateRow(row, 4);
    expect(result.valid).toBe(false);
    expect(result.log.status).toBe(LogStatus.SKIPPED);
    expect(result.log.reason).toBe('Missing Brand');
  });

  it('should reject rows with malformed prices', () => {
    const row = {
      product: 'Gaming Chair',
      brand: 'ErgoSeat',
      platform: 'Amazon India',
      basePrice: 'ABC'
    };
    const result = validateRow(row, 5);
    expect(result.valid).toBe(false);
    expect(result.log.status).toBe(LogStatus.SKIPPED);
    expect(result.log.reason).toBe('Invalid Base Price');
    expect(result.log.message).toContain('Unable to read price');
  });
});
