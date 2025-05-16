export const convertQuantityToItemUnit = (quantity, soUnit, itemUnit) => {
  const normalizedSoUnit = soUnit?.toLowerCase().trim();
  const normalizedItemUnit = itemUnit?.toLowerCase().trim();

  const isBottle = (unit) => unit === 'bot' || unit === 'bottle';

  const getCaseSize = (unit) => {
    const match = unit.match(/^c(\d+)$/i); // matches C4, C6, C12, etc.
    return match ? parseInt(match[1], 10) : null;
  };

  const soCaseSize = getCaseSize(normalizedSoUnit);
  const itemCaseSize = getCaseSize(normalizedItemUnit);

  // Case 1: both are bottles → no conversion
  if (isBottle(normalizedSoUnit) && isBottle(normalizedItemUnit)) {
    return quantity;
  }

  // Case 2: soUnit is bottles, itemUnit is case → convert bottles to cases
  if (isBottle(normalizedSoUnit) && itemCaseSize) {
    return parseFloat((quantity / itemCaseSize).toFixed(4));
  }

  // Case 3: soUnit is case, itemUnit is bottle → convert cases to bottles
  if (soCaseSize && isBottle(normalizedItemUnit)) {
    return quantity * soCaseSize;
  }

  // Case 4: both are case units (e.g., C6 and C12) → normalize between cases
  if (soCaseSize && itemCaseSize) {
    return parseFloat(((quantity * soCaseSize) / itemCaseSize).toFixed(4));
  }

  // Default: no conversion
  return quantity;
};
