import sendEmail from './sendEmail.js';

/**
 * Standardizes warehouse names in CSV content
 * @param {string} csvContent - The CSV content to process
 * @param {string} standardWarehouseName - The standard warehouse name to use
 * @returns {string} The processed CSV content
 */
export const standardizeWarehouseNames = (
  csvContent,
  standardWarehouseName = 'F.A.R. TRUCKING & WARHOUSING INC.',
) => {
  const rows = csvContent.split('\n');
  if (rows.length === 0) {
    console.warn('Empty CSV content provided to warehouse standardizer');
    return csvContent;
  }

  // Find warehouse column (checking common variations)
  const headers = rows[0].split(',').map((h) => h.trim());
  const warehouseNameIndex = headers.findIndex(
    (header) =>
      header === 'warehouse_name' ||
      header.toLowerCase().includes('warehouse') ||
      header.toLowerCase().includes('wh'),
  );

  if (warehouseNameIndex === -1) {
    console.warn('No warehouse name column found - skipping standardization');
    return csvContent;
  }

  console.log(
    `Found warehouse column: "${headers[warehouseNameIndex]}" at index ${warehouseNameIndex}`,
  );
  let replacementCount = 0;

  const processedRows = [rows[0]]; // Keep header row

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].split(',');

    if (warehouseNameIndex < row.length) {
      const originalValue = row[warehouseNameIndex].trim();

      if (originalValue && originalValue !== standardWarehouseName) {
        console.log(
          `[Row ${i}] Updated warehouse_name from "${originalValue}" to "${standardWarehouseName}"`,
        );
        row[warehouseNameIndex] = standardWarehouseName;
        replacementCount++;
      } else if (originalValue === standardWarehouseName) {
        console.log(
          `[Row ${i}] Warehouse name already correct: "${originalValue}"`,
        );
      }
    }

    processedRows.push(row.join(','));
  }

  if (replacementCount > 0) {
    console.log(
      `Standardized ${replacementCount} warehouse names to "${standardWarehouseName}"`,
    );
    sendEmail(
      `Warning: Standardized ${replacementCount} warehouse names to "${standardWarehouseName}"`,
    );
  } else {
    console.log('All warehouse names were already standardized');
  }

  return processedRows.join('\n');
};
