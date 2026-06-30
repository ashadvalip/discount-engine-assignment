/**
 * cartImporter.js
 *
 * Coordinates the full PDF ingestion pipeline:
 * Extract layout rows -> Validate rows -> Parse prices -> Return clean items + audit logs.
 */

import { parseCartPDF } from './pdfParser.js';
import { validateRow } from './cartValidator.js';
import { LogStatus } from './parserTypes.js';

/**
 * Orchestrates the PDF ingestion pipeline.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{ validItems: Array<Object>, logs: Array<Object>, skippedCount: number, importedCount: number, totalCartValue: number }>}
 */
export async function processPDFUpload(arrayBuffer) {
  const { rows: rawRows, errors: extractionErrors } = await parseCartPDF(arrayBuffer);

  const validItems = [];
  const logs = [];
  let skippedCount = 0;

  // Add general layout extraction errors to the logs
  extractionErrors.forEach(err => {
    logs.push({
      rowNum: 0,
      status: LogStatus.SKIPPED,
      message: err,
      reason: 'Extraction Failure'
    });
    skippedCount++;
  });

  // Validate and parse each row
  rawRows.forEach(row => {
    const result = validateRow(row, row.rowNum);
    
    // Add row log to audit trail
    logs.push(result.log);
    
    if (result.valid) {
      validItems.push({
        itemId: 'ITEM-' + String(validItems.length + 1).padStart(2, '0'),
        ...result.item
      });
    } else {
      skippedCount++;
    }
  });

  // Calculate sum of base prices for valid items
  const totalCartValue = validItems.reduce((sum, item) => sum + item.basePrice, 0);

  return {
    validItems,
    logs,
    skippedCount,
    importedCount: validItems.length,
    totalCartValue
  };
}
