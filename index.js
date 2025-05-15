// import cron from "node-cron";
import refreshToken from './refreshToken.js';
import parseCSV from './parseCSV.js';
import pushItemToZoho from './pushItemToZoho.js';
import pushPOToZoho from './pushPOToZoho.js';
import pushCustomerToZoho from './pushCustomerToZoho.js';
import pushSOToZoho from './pushSOToZoho.js';
import fetchWarehousesFromZoho from './fetchWarehousFromZoho.js';
import fetchVendorsFromZoho from './fetchVendorFromZoho.js';
import dotenv from 'dotenv';
import { Storage } from '@google-cloud/storage';
import { formatInTimeZone } from 'date-fns-tz';
import express from 'express';
import nodemailer from 'nodemailer';
// import fetchCustomerFromZoho, { fetchAllCustomersFromZoho } from "./fetchCustomerFromZoho.js";

dotenv.config();

console.log('App is running');

// Initialize Express
const app = express();
app.use(express.json());

// Initialize Google Cloud Storage client
const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME;

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'fartrucking4@gmail.com',
    pass: process.env.TRANSPORTER_APP_PASSWORD,
  },
});

const sendEmail = async (text) => {
  try {
    const info = await transporter.sendMail({
      from: '"FAR Warehousing" <fartrucking4@gmail.com>', // Sender email
      to: 'vishal.kudtarkar@techsierra.in, fartrucking4@gmail.com', // Recipients
      // to: "vishal.kudtarkar@techsierra.in", // Recipients
      subject: 'Order Processing Logs',
      text: text,
      html: text,
    });

    console.log('sendEmail(), Message sent on email: ', text);
    console.log('sendEmail(), ✅ Email sent:', info.messageId);
  } catch (error) {
    console.error('sendEmail(), ❌ Error sending email:', error);
  }
};

function getCurrentDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Function to log errors to a text file in GCS
async function logError(operation, filePath, message, retries = 3) {
  const logDir = `Documents/ErrorLogs/${getCurrentDate()}/`;
  const logFile = `${logDir}errorLog.txt`;

  try {
    const now = new Date();
    const istDate = formatInTimeZone(
      now,
      'Asia/Kolkata',
      'dd-MM-yyyy HH:mm:ss',
    );

    const logMessage = `Date and Time (IST): ${istDate}\nOperation: ${operation}\nFile Path: ${filePath}\nError Message: ${message}\n\n`;

    const file = storage.bucket(bucketName).file(logFile);

    const [exists] = await file.exists();

    if (exists) {
      const [content] = await file.download();
      const updatedContent = content.toString() + logMessage;
      await file.save(updatedContent, { resumable: false });
    } else {
      await file.save(logMessage, { resumable: false });
    }

    console.log(`logError(), Error logged successfully to ${logFile}`);
  } catch (error) {
    if (retries > 0) {
      console.warn(
        `logError(), Retrying logError. Retries left: ${retries - 1}`,
      );
      setTimeout(
        () => logError(operation, filePath, message, retries - 1),
        1000,
      );
    } else {
      console.error(
        `logError(), Error logging error message: ${error.message}`,
      );
    }
  }
}

async function getFilesFromBucket() {
  try {
    // Fetch all files from the bucket without any prefix
    const [files] = await storage.bucket(bucketName).getFiles();

    // Define prefixes for folders to skip
    const skipPrefixes = ['Documents/', 'processed/', 'not-processed/'];

    // Filter out files that belong to the "Documents" or "processed" folders
    const filteredFiles = files.filter((file) => {
      const filePath = file.name;
      return !skipPrefixes.some((prefix) => filePath.startsWith(prefix));
    });

    return filteredFiles;
  } catch (error) {
    await logError('Fetching Files from GCS', bucketName, error.message);
    return [];
  }
}

// Function to check if a file is a CSV
function isCSVFile(fileName) {
  return fileName.toLowerCase().endsWith('.csv');
}

let allItemData = [];
let allCustomerData = [];

// Function to process each CSV file
async function processCSVFile(
  filePath,
  newToken,
  vendors = null,
  wareHouses = null,
  customers = null,
) {
  let result = null;
  try {
    const file = storage.bucket(bucketName).file(filePath);
    const [fileContents] = await storage
      .bucket(bucketName)
      .file(filePath)
      .download();

    let data;
    try {
      data = parseCSV(fileContents.toString());
    } catch (parseError) {
      console.error(
        `processCSVFile(), Error parsing CSV for file ${filePath}:`,
        parseError,
      );
      await logError('Parsing CSV', filePath, parseError.message);
      sendEmail(
        `Error parsing CSV for file ${filePath}: ${parseError.message}`,
      );
      // Move the file to the "not-processed" folder
      await moveFileToFolder(
        file,
        `not-processed/FAILED_${filePath.split('/').pop()}`,
      );
      return null;
    }

    if (!data || data.length === 0) {
      console.log(`processCSVFile(), Empty CSV file: ${filePath}`);
      sendEmail(`Empty CSV file: ${filePath}`);
      // Move the file to the "not-processed" folder
      await moveFileToFolder(
        file,
        `not-processed/EMPTY_${filePath.split('/').pop()}`,
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
            `not-processed/ERROR_ITEM_${filePath.split('/').pop()}`,
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
          );
        } catch (error) {
          console.error(
            `processCSVFile(), Error processing "PO" file: ${filePath}`,
            error,
          );
          sendEmail(`Error processing "PO" file: ${filePath}: ${error}`);
          await moveFileToFolder(
            file,
            `not-processed/ERROR_PO_${filePath.split('/').pop()}`,
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

          // allCustomerData = result;
          // allCustomerData = Array.isArray(result[0]) ? result[0] : result;
          // const flattenedCustomers = Array.isArray(customers[0]) ? customers[0] : customers;
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
            `not-processed/ERROR_CUSTOMER_${filePath.split('/').pop()}`,
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
            `not-processed/ERROR_SO_${filePath.split('/').pop()}`,
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
          `not-processed/UNRECOGNIZED_${filePath.split('/').pop()}`,
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
        await file.copy(storage.bucket(bucketName).file(destination));
        await file.delete();
        console.log(`processCSVFile(), File renamed to: ${destination}`);
      }
    } catch (error) {
      console.error(
        `processCSVFile(), Error processing file ${filePath}:`,
        error,
      );
      await moveFileToFolder(
        file,
        `not-processed/ERROR_${filePath.split('/').pop()}`,
      );
      return null;
    }
  } catch (error) {
    console.error(
      `processCSVFile(), Error processing file ${filePath}:`,
      error,
    );
    await logError('Processing CSV', filePath, error.message);

    // Move the file to the "not-processed" folder
    await moveFileToFolder(
      file,
      `not-processed/FAILED_${filePath.split('/').pop()}`,
    );
  }

  return result;
}

// Helper function to move a file to a specific folder
async function moveFileToFolder(file, destination) {
  try {
    await file.copy(storage.bucket(bucketName).file(destination));
    await file.delete();
    console.log(`moveFileToFolder(), File moved to: ${destination}`);
  } catch (moveError) {
    console.error(
      `moveFileToFolder(), Error moving file to ${destination}:`,
      moveError,
    );
  }
}

// Main processing function to handle all files from different vendors
async function processDirectories() {
  const newToken = await refreshToken();
  console.log(
    `processDirectories(), Starting to process directories in bucket: ${bucketName}`,
  );
  const files = await getFilesFromBucket();
  // const customers = await fetchAllCustomersFromZoho(newToken.access_token);
  // console.log('All Customer Data =>', customers)

  if (!files || files.length === 0) {
    console.log('processDirectories(), No files found in the bucket.');
    return; // Exit the function
  }

  const wareHouses = await fetchWarehousesFromZoho(
    newToken.access_token,
    sendEmail,
  );

  const vendors = await fetchVendorsFromZoho(newToken.access_token, sendEmail);
  // const customers = await fetchCustomerFromZoho(newToken.access_token);
  // console.log('All Customer Data =>', customers)

  // Categorize files by type
  const itemFiles = [];
  const poFiles = [];
  const customerFiles = [];
  const soFiles = [];

  for (const file of files) {
    const filePath = file.name;

    // Ensure file.name exists
    if (!filePath) {
      console.log('processDirectories(), Skipping file with no name');
      continue;
    }

    if (filePath.endsWith('/')) {
      console.log(`processDirectories(), Skipping directory: ${filePath}`);
      continue;
    }

    if (!isCSVFile(filePath)) {
      console.log(`processDirectories(), Skipping non-CSV file: ${filePath}`);
      continue;
    }

    // Classify files based on their headers
    const fileContents = await storage
      .bucket(bucketName)
      .file(filePath)
      .download();
    let data;
    try {
      data = parseCSV(fileContents[0].toString());
    } catch (parseError) {
      console.error(
        `processDirectories(), Error parsing CSV for file ${filePath}:`,
        parseError,
      );
      await logError('Parsing CSV', filePath, parseError.message);
      continue;
    }

    const headers = Object.keys(data[0]); // Extract headers from the first row

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

  // **Ensure SO files are processed first**
  const processingOrder = [
    ...itemFiles,
    ...poFiles,
    ...customerFiles,
    ...soFiles,
  ];

  for (const file of processingOrder) {
    console.log(`processDirectories(), Processing file: ${file.name}`);
    await processCSVFile(file.name, newToken.access_token, vendors, wareHouses);
  }
}

// Execute the process immediately
// processDirectories();

// Create an Express route to trigger the process
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

// Start the Express server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Schedule the task based on the pattern specified in the .env file
// Uncomment the following line to enable scheduling
// cron.schedule(process.env.SCHEDULE_PATTERN, processDirectories);

// export default function Component() {
//   return null; // This component doesn't render anything
// }
