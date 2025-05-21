import refreshToken from './utils/refreshToken.js';
import parseCSV from './utils/parseCSV.js';
import fetchWarehousesFromZoho from './fetchDataFromZoho/fetchWarehousFromZoho.js';
import fetchVendorsFromZoho from './fetchDataFromZoho/fetchVendorFromZoho.js';
import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';
import express from 'express';
import { fetchAllCustomersFromZoho } from './fetchDataFromZoho/fetchCustomerFromZoho.js';
import pushItemToZoho from './pushFilesToZoho/pushItemToZoho.js';
import pushPOToZoho from './pushFilesToZoho/pushPOToZoho.js';
import pushCustomerToZoho from './pushFilesToZoho/pushCustomerToZoho.js';
import pushSOToZoho from './pushFilesToZoho/pushSOToZoho.js';
import sendEmail from './utils/sendEmail.js';
import getFilesFromBucket from './utils/getFilesFromBucket.js';
import moveFileToFolder from './utils/moveFileToFolder.js';
import classifyFiles from './utils/classifyFiles.js';
import { normalizeCSVContent } from './utils/normalizeColumnName.js';

dotenv.config();

console.log('App is running');

const app = express();
app.use(express.json());

// Initialize Google Cloud Storage client
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME;

let allItemData = [];
let allCustomerData = [];

async function processCSVFile(
  filePath,
  newToken,
  vendors = null,
  wareHouses = null,
  existingCustomers = null,
) {
  let result = null;
  try {
    const file = storage.bucket(bucketName).file(filePath);
    const [fileContents] = await storage
      .bucket(bucketName)
      .file(filePath)
      .download();

    // Normalize the CSV content before parsing
    const normalizedCSVContent = normalizeCSVContent(fileContents.toString());
    console.log(
      `processCSVFile(), CSV content normalized for file: ${filePath}`,
    );

    let data;
    try {
      data = parseCSV(normalizedCSVContent);
    } catch (parseError) {
      console.error(
        `processCSVFile(), Error parsing CSV for file ${filePath}:`,
        parseError,
      );
      await logError('Parsing CSV', filePath, parseError.message);
      sendEmail(
        `Error parsing CSV for file ${filePath}: ${parseError.message}`,
      );
      await moveFileToFolder(
        file,
        storage,
        bucketName,
        `not-processed/FAILED_${filePath.split('/').pop()}`
      );
      return null;
    }

    if (!data || data.length === 0) {
      console.log(`processCSVFile(), Empty CSV file: ${filePath}`);
      sendEmail(`Empty CSV file: ${filePath}`);
      await moveFileToFolder(
        file,
        storage,
        bucketName,
        `not-processed/EMPTY_${filePath.split('/').pop()}`
      );
      return null;
    }

    const headers = Object.keys(data[0]); // Extract headers from the first row
    console.log(`processCSVFile(), Headers in the file: ${headers.join(', ')}`);

    try {
      if (headers.includes('sku') && headers.includes('name')) {
        console.log(`processCSVFile(), Processing as "item" file: ${filePath}`);
        try {
          result = await pushItemToZoho(
            process.env.ZOHO_API_URL,
            newToken,
            data,
            wareHouses,
            sendEmail,
          );
          console.log(
            `processCSVFile(), Result from pushItemToZoho for ${filePath}:`,
            result,
          );
          if (result) {
            allItemData = allItemData.concat(result);
            const uniqueItems = {};
            allItemData.forEach((item) => {
              uniqueItems[item.sku] = item;
            });
            allItemData = Object.values(uniqueItems);
          }
          console.log(
            `processCSVFile(), All item data after processing ${filePath}:`,
            allItemData,
          );
        } catch (error) {
          console.error(
            `processCSVFile(), Error processing "item" file: ${filePath}`,
            error,
          );
          sendEmail(`Error processing "item" file: ${filePath}: ${error}`);
          await moveFileToFolder(
            file,
            storage,
            bucketName,
            `not-processed/ERROR_ITEM_${filePath.split('/').pop()}`
          );
          return null;
        }
      } else if (
        headers.includes('purchaseorder_number') &&
        headers.includes('vendor_name')
      ) {
        console.log(`processCSVFile(), Processing as "PO" file: ${filePath}`);
        try {
          result = await pushPOToZoho(
            process.env.ZOHO_API_URL,
            newToken,
            data,
            vendors,
            wareHouses,
            allItemData,
            sendEmail,
          );
        } catch (error) {
          console.error(
            `processCSVFile(), Error processing "PO" file: ${filePath}`,
            error,
          );
          sendEmail(`Error processing "PO" file: ${filePath}: ${error}`);
          await moveFileToFolder(
            file,
            storage,
            bucketName,
            `not-processed/ERROR_PO_${filePath.split('/').pop()}`
          );
          return null;
        }
      } else if (
        headers.includes('contact_name') &&
        headers.includes('company_name')
      ) {
        console.log(
          `processCSVFile(), Processing as "customer" file: ${filePath}`,
        );
        try {
          result = await pushCustomerToZoho(
            process.env.ZOHO_API_URL,
            newToken,
            data,
            existingCustomers,
            sendEmail,
          );
          console.log(
            `processCSVFile(), Result from pushCustomerToZoho for ${filePath}:`,
            result,
          );

          const newCustomerData = Array.isArray(result[0]) ? result[0] : result;

          if (!allCustomerData) {
            allCustomerData = [];
          }

          allCustomerData = [...allCustomerData, ...newCustomerData];
          const uniqueCustomers = {};

          allCustomerData.forEach((customer) => {
            // Handle the special case where customerId might be an object
            let customerIdValue;

            if (
              customer.customerId &&
              typeof customer.customerId === 'object' &&
              customer.customerId.customerId
            ) {
              customerIdValue = customer.customerId.customerId;
            } else {
              customerIdValue = customer.customerId;
            }

            if (customerIdValue) {
              uniqueCustomers[customerIdValue] = customer;
            } else {
              // Fallback to using the company name and contact name combination
              const fallbackKey = `${customer.companyName}_${customer.contactName}`;
              uniqueCustomers[fallbackKey] = customer;
            }
          });

          allCustomerData = Object.values(uniqueCustomers);
          console.log(
            `processCSVFile(), All customer data after processing ${filePath}:`,
            allCustomerData,
          );
        } catch (error) {
          console.error(
            `processCSVFile(), Error processing "customer" file: ${filePath}`,
            error,
          );
          sendEmail(`Error processing "customer" file: ${filePath}: ${error}`);
          await moveFileToFolder(
            file,
            storage,
            bucketName,
            `not-processed/ERROR_CUSTOMER_${filePath.split('/').pop()}`
          );
          return null;
        }
      } else if (
        headers.includes('customer_name') &&
        headers.includes('salesorder_number')
      ) {
        console.log(`processCSVFile(), Processing as "SO" file: ${filePath}`);
        try {
          result = await pushSOToZoho(
            process.env.ZOHO_API_URL,
            newToken,
            data,
            allCustomerData,
            existingCustomers,
            wareHouses,
            sendEmail,
          );
        } catch (error) {
          console.error(
            `processCSVFile(), Error processing "SO" file: ${filePath}`,
            error,
          );
          sendEmail(`Error processing "SO" file: ${filePath}: ${error}`);
          await moveFileToFolder(
            file,
            storage,
            bucketName,
            `not-processed/ERROR_SO_${filePath.split('/').pop()}`
          );
          return null;
        }
      } else {
        console.log(
          `processCSVFile(), Unrecognized file structure: ${filePath}`,
        );
        sendEmail(
          `Your file "${filePath}" could not be processed. Please ensure your file contains the required headers for one of these supported file types:
  - Item files: must include "sku" and "name" headers
  - Purchase Order (PO) files: must include "purchaseorder_number" and "vendor_name" headers
  - Customer files: must include "contact_name" and "company_name" headers
  - Sales Order (SO) files: must include "customer_name" and "salesorder_number" headers
  
  Please reformat your file according to our templates and try again.`,
        );
        await moveFileToFolder(
          file,
          storage,
          bucketName,
          `not-processed/UNRECOGNIZED_${filePath.split('/').pop()}`
        );
        return null;
      }

      if (result) {
        console.log(
          `processCSVFile(), File processed successfully: ${filePath}`,
        );
        sendEmail(`File processed successfully: ${filePath}`);
        const newFilePath = `DONE_${filePath.split('/').pop()}`;
        const destination = `processed/${newFilePath}`;
        await moveFileToFolder(file, storage, bucketName, destination);
        console.log(`processCSVFile(), File moved to: ${destination}`);
      }
    } catch (error) {
      console.error(
        `processCSVFile(), Error processing file ${filePath}:`,
        error,
      );
      await moveFileToFolder(
        file,
        storage,
        bucketName,
        `not-processed/ERROR_${filePath.split('/').pop()}`
      );
      return null;
    }
  } catch (error) {
    console.error(
      `processCSVFile(), Error processing file ${filePath}:`,
      error,
    );
    await logError('Processing CSV', filePath, error.message);

    // Get the file object again in case it wasn't created in the try block
    const file = storage.bucket(bucketName).file(filePath);
    
    // Move the file to the "not-processed" folder
    await moveFileToFolder(
      file,
      storage,
      bucketName,
      `not-processed/FAILED_${filePath.split('/').pop()}`
    );
  }

  return result;
}

async function processDirectories() {
  const newToken = await refreshToken();
  console.log(
    `processDirectories(), Starting to process directories in bucket: ${bucketName}`,
  );

  const files = await getFilesFromBucket(storage, bucketName);
  if (!files || files.length === 0) {
    console.log('processDirectories(), No files found in the bucket.');
    return; // Exit the function
  }

  const wareHouses = await fetchWarehousesFromZoho(
    newToken.access_token,
    sendEmail,
  );

  const vendors = await fetchVendorsFromZoho(newToken.access_token, sendEmail);

  const existingCustomers = await fetchAllCustomersFromZoho(
    newToken.access_token,
  );

  // Categorize files by type using the utility function
  const { itemFiles, poFiles, customerFiles, soFiles } = await classifyFiles(
    files,
    storage,
    bucketName,
  );

  // Process files in a specific order: items, POs, customers, SOs
  const processingOrder = [
    ...itemFiles,
    ...poFiles,
    ...customerFiles,
    ...soFiles,
  ];

  for (const file of processingOrder) {
    console.log(`processDirectories(), Processing file: ${file.name}`);
    await processCSVFile(
      file.name,
      newToken.access_token,
      vendors,
      wareHouses,
      existingCustomers,
    );
  }
}

app.post('/processDirectories', async (req, res) => {
  try {
    await processDirectories();
    res.status(200).send('Directories processed successfully.');
  } catch (error) {
    console.error(
      'app.post(/processDirectories), Error processing directories:',
      error,
    );
    res.status(500).send('Error processing directories.');
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
