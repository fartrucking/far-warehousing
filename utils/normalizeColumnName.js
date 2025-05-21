import { standardizeWarehouseNames } from "./standardizeWarehouseNames";

// Function to normalize column names in CSV
const normalizeColumnName = (columnName) => {
  const columnMappings = {
    //ITEM
    name: ['name'],
    sku: ['sku'],
    item_type: ['itemtype'],
    product_type: ['producttype'],
    unit: ['unit'],
    initial_stock: ['openingstock'],
    warehouse_name: ['warehousename'],
    //PO
    purchaseorder_number: ['purchaseordernumber'],
    purchaseorder_date: ['purchaseorderdate'],
    delivery_date: ['deliverydate'],
    vendor_name: ['vendorname'],
    vendor_number: ['vendornumber'],
    item_name: ['itemname'],
    quantity_received: ['quantityreceived'],
    quantity_billed: ['quantitybilled'],
    item_total: ['item_total'],
    //CUSTOMER
    contact_name: ['contactname'],
    company_name: ['companyname'],
    currency_id: ['currencyid'],
    contact_type: ['contacttype'],
    billing_attention: ['billingattention'],
    billing_address: ['billingaddress'],
    billing_street2: ['billingstreet2'],
    billing_city: ['billingcity'],
    billing_state: ['billingstate'],
    billing_zip: ['billingzip'],
    billing_country: ['billingcountry'],
    shipping_attention: ['shippingattention'],
    shipping_address: ['shippingaddress'],
    shipping_street2: ['shippingstreet2'],
    shipping_city: ['shippingcity'],
    shipping_state: ['shippingstate'],
    shipping_zip: ['shippingzip'],
    shipping_country: ['shippingcountry'],
    language_code: ['languagecode'],
    country_code: ['countrycode'],
    is_tds_registered: ['istdsregistered'],
    tax_id: ['taxid'],
    is_taxable: ['istaxable'],
    gst_no: ['gstno'],
    gst_treatment: ['gsttreatment'],
    //SO
    customer_name: ['customername'],
    salesorder_number: ['salesordernumber'],
    date: ['date'],
    shipment_date: ['shipmentdate'],
    sku: ['sku'],
    item_name: ['itemname'],
    item_rate: ['itemrate'],
    item_quantity: ['itemquantity'],
    item_unit: ['itemunit'],
    item_total: ['itemtotal'],
    warehouse_name: ['warehousename'],
    notes: ['notes'],
    terms: ['terms'],
    discount: ['discount'],
    is_discount_before_tax: ['isdiscountbeforetax'],
    shipping_charge: ['shippingcharge'],
    delivery_method: ['deliverymethod'],
  };

  // Normalize the column name: lowercase, remove spaces, underscores, and non-alphabetical characters
  const columnKey = columnName
    .toLowerCase()
    .replace(/[\s_]/g, '')
    .replace(/[^a-z]/g, '');

  // Helper function to calculate character frequency
  const calculateCharFrequency = (str) => {
    const freq = {};
    for (const char of str) {
      freq[char] = (freq[char] || 0) + 1;
    }
    return freq;
  };

  // Helper function to compare character frequencies
  const isMatchingByCharFrequency = (source, target) => {
    const sourceFreq = calculateCharFrequency(source);
    const targetFreq = calculateCharFrequency(target);
    for (const char in sourceFreq) {
      if (sourceFreq[char] !== targetFreq[char]) {
        return false;
      }
    }
    return Object.keys(sourceFreq).length === Object.keys(targetFreq).length;
  };

  // Find a matching column name in columnMappings
  for (const [standardName, patterns] of Object.entries(columnMappings)) {
    for (const pattern of patterns) {
      if (isMatchingByCharFrequency(columnKey, pattern)) {
        return standardName; // Return the standard column name if there's a match
      }
    }
  }

  return columnName.toLowerCase(); // Return normalized name if no mapping is found
};

// Function to find indices of date-related columns in the headers
const findDateColumns = (headers) => {
  const dateKeywords = [
    'date',
    'shipment_date',
    'order_date',
    'purchaseorder_date',
    'delivery_date',
  ];
  return headers
    .map((header, index) =>
      dateKeywords.some((keyword) => header.includes(keyword)) ? index : -1,
    )
    .filter((index) => index !== -1);
};

// Function to normalize date to YYYY-MM-DD format
const normalizeDate = (dateString) => {
  const date = new Date(dateString);
  if (isNaN(date)) {
    console.log(`Invalid date format: ${dateString}`);
    return dateString; // Return the original value if invalid
  }
  // Format as YYYY-MM-DD
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// Function to normalize CSV content
export const normalizeCSVContent = (csvContent) => {
  let normalizedContent = csvContent;

  // First standardize warehouse names
  normalizedContent = standardizeWarehouseNames(normalizedContent);

  const rows = normalizedContent.split('\n');
  if (rows.length === 0) {
    console.log('CSV file is empty');
    return normalizedContent;
  }

  // Normalize the header row
  const headerRow = rows[0].split(',');
  const normalizedHeaders = headerRow.map((col) =>
    normalizeColumnName(col.trim()),
  );
  rows[0] = normalizedHeaders.join(',');
  console.log(`Normalized Header: ${rows[0]}`);

  // Identify date-related columns
  const dateColumns = findDateColumns(normalizedHeaders);

  const processedRows = [rows[0]]; // Include the header row
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i].split(',');

    // Skip empty rows
    if (row.every((cell) => cell.trim() === '')) {
      console.log(`Skipping empty row at index ${i}`);
      continue;
    }

    // Normalize date columns
    for (const dateColIndex of dateColumns) {
      if (dateColIndex < row.length && row[dateColIndex]) {
        row[dateColIndex] = normalizeDate(row[dateColIndex]);
      }
    }

    processedRows.push(row.join(','));
  }

  return processedRows.join('\n');
};
