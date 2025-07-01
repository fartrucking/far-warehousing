import sendEmail from './sendEmail.js';

/**
 * Standardizes warehouse names in CSV content
 * @param {string} csvContent - The CSV content to process
 * @param {string} standardWarehouseName - The standard warehouse name to use
 * @returns {string} The processed CSV content
 */
export function standardizeWarehouseNames(csvContent) {
  const standardName = 'F.A.R. TRUCKING & WAREHOUSING INC.';
  const rows = [];
  let currentRow = [];
  let inQuotes = false;
  let currentField = '';

  // Robust CSV parsing that handles quoted fields with commas
  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if (char === '\n' && !inQuotes) {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Find warehouse column index
  const headers = rows[0];
  const warehouseIndex = headers.findIndex(header => 
    header.trim().toLowerCase().includes('warehouse') || 
    header.trim().toLowerCase().includes('wh')
  );

  if (warehouseIndex === -1) return csvContent;

  // Process rows
  const processedRows = rows.map((row, rowIndex) => {
    if (rowIndex === 0) return row; // Skip header
    
    if (row[warehouseIndex] && row[warehouseIndex] !== standardName) {
      row[warehouseIndex] = standardName;
    }
    return row;
  });

  // Convert back to CSV
  return processedRows.map(row => 
    row.map(field => 
      field.includes(',') ? `"${field}"` : field
    ).join(',')
  ).join('\n');
}
