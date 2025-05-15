export const normalizeString = (str) => str?.toLowerCase().replace(/\s+/g, '');

export function normalizeSku(sku) {
  return sku
    .replace(/\s*-\s*/g, '') // remove all spaces around hyphens
    .replace(/\s+/g, '') // remove remaining spaces
    .toLowerCase(); // make lowercase
}
