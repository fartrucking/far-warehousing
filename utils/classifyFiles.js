import { isCSVFile } from './normalizeUtils.js';
import parseCSV from './parseCSV.js';

export default async function classifyFiles(files, storage, bucketName) {
  const itemFiles = [];
  const poFiles = [];
  const customerFiles = [];
  const soFiles = [];

  for (const file of files) {
    const filePath = file.name;

    if (!filePath || filePath.endsWith('/') || !isCSVFile(filePath)) {
      continue;
    }

    let fileContents;
    try {
      fileContents = await storage.bucket(bucketName).file(filePath).download();
    } catch {
      continue;
    }

    let data;
    try {
      data = parseCSV(fileContents[0].toString());
    } catch {
      continue;
    }

    const headers = Object.keys(data[0] || {});
    if (headers.includes('sku') && headers.includes('name')) {
      itemFiles.push(file);
    } else if (
      headers.includes('purchaseorder_number') &&
      headers.includes('vendor_name')
    ) {
      poFiles.push(file);
    } else if (
      headers.includes('contact_name') &&
      headers.includes('company_name')
    ) {
      customerFiles.push(file);
    } else if (
      headers.includes('customer_name') &&
      headers.includes('salesorder_number')
    ) {
      soFiles.push(file);
    }
  }

  return { itemFiles, poFiles, customerFiles, soFiles };
}
