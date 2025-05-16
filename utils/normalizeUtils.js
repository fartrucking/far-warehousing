export const normalizeString = (str) => str?.toLowerCase().replace(/\s+/g, '');

export function normalizeSku(sku) {
  return sku
    .replace(/\s*-\s*/g, '') // remove all spaces around hyphens
    .replace(/\s+/g, '') // remove remaining spaces
    .toLowerCase(); // make lowercase
}

// Function to check if a file is a CSV
export function isCSVFile(fileName) {
  return fileName.toLowerCase().endsWith('.csv');
}

export function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default getCurrentDate;
