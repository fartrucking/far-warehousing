import https from 'https';
import fetchCustomerFromZoho from '../fetchDataFromZoho/fetchCustomerFromZoho.js';
import pLimit from 'p-limit';
import { normalizeString } from '../utils/normalizeUtils.js';

const limit = pLimit(10);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findExistingCustomer(newCustomer, existingCustomers) {
  if (
    !newCustomer ||
    !Array.isArray(existingCustomers) ||
    existingCustomers.length === 0
  ) {
    return null;
  }

  const newContactName = normalizeString(newCustomer.contact_name);
  const newCompanyName = normalizeString(newCustomer.company_name);

  if (!newContactName && !newCompanyName) {
    return null;
  }

  return (
    existingCustomers.find((c) => {
      if (!c) return false;

      const existingContactName = normalizeString(c.contact_name);
      const existingCompanyName = normalizeString(
        c.company_name || c.customer_name,
      );

      const contactMatch =
        newContactName &&
        existingContactName &&
        existingContactName === newContactName;

      const companyMatch =
        newCompanyName &&
        existingCompanyName &&
        existingCompanyName === newCompanyName;

      return contactMatch || companyMatch;
    }) || null
  );
}

async function makeZohoRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response);
        } catch (err) {
          reject(new Error(`Error parsing response: ${err.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Network error: ${error.message}`));
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function createCustomer(customer, options) {
  const customerData = {
    contact_name: customer.contact_name || '',
    company_name: customer.company_name || '',
    contact_type: customer.contact_type || 'customer',
    billing_address: {
      attention: customer.billing_attention || customer.contact_name || '',
      address: customer.billing_address || '',
      city: customer.billing_city || '',
      state: customer.billing_state || '',
      zip: customer.billing_zip || '',
      country: customer.billing_country || '',
    },
    shipping_address: {
      attention: customer.shipping_attention || customer.contact_name || '',
      address: customer.shipping_address || '',
      city: customer.shipping_city || '',
      state: customer.shipping_state || '',
      zip: customer.shipping_zip || '',
      country: customer.shipping_country || '',
    },
    language_code: customer.language_code || '',
  };

  const createOptions = {
    ...options,
    method: 'POST',
    path: `/inventory/v1/contacts?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
  };

  const response = await makeZohoRequest(createOptions, customerData);

  if (response.code === 0) {
    return {
      success: true,
      customer_id: response.contact.contact_id,
    };
  } else if (response.code === 3062) {
    return {
      success: false,
      reason: 'duplicate',
      message: response.message || 'Duplicate contact',
    };
  } else {
    return {
      success: false,
      reason: 'error',
      message: response.message || 'Unknown error',
    };
  }
}

async function pushCustomerToZoho(
  apiUrl,
  authToken,
  customerData,
  existingCustomers = null,
  sendEmail = null,
) {
  console.log('pushCustomerToZoho(), Processing customers to push to Zoho...');

  if (!authToken) {
    throw new Error('Auth token is required');
  }

  if (!Array.isArray(customerData) || customerData.length === 0) {
    console.log('pushCustomerToZoho(), No customers to process');
    return [];
  }

  const options = {
    hostname: 'www.zohoapis.com',
    headers: {
      Authorization: `Zoho-oauthtoken ${authToken}`,
      'Content-Type': 'application/json',
    },
  };

  let customerDetails = [];

  const validCustomers = customerData.filter(
    (customer) => customer && (customer.contact_name || customer.company_name),
  );

  if (validCustomers.length < customerData.length) {
    console.log(
      `pushCustomerToZoho(), Filtered out ${customerData.length - validCustomers.length} invalid customer records`,
    );
  }

  let customersToProcess = [...validCustomers];

  if (Array.isArray(existingCustomers) && existingCustomers.length > 0) {
    console.log(
      `pushCustomerToZoho(), Checking against ${existingCustomers.length} existing customers...`,
    );

    const existingCustomerBatch = customersToProcess.filter((newCustomer) => {
      const existingCustomer = findExistingCustomer(
        newCustomer,
        existingCustomers,
      );

      if (existingCustomer) {
        console.log(
          `pushCustomerToZoho(), Customer already exists: ${
            newCustomer.contact_name || newCustomer.company_name
          } (ID: ${existingCustomer.contact_id})`,
        );

        customerDetails.push({
          contactName: existingCustomer.contact_name,
          companyName: existingCustomer.company_name,
          customerId: existingCustomer.contact_id,
          status: 'existing',
        });

        return false;
      }

      return true;
    });

    customersToProcess = existingCustomerBatch;
    console.log(
      `pushCustomerToZoho(), ${customersToProcess.length} new customers to be processed.`,
    );
  }

  const processCustomer = async (customer, index) => {
    const customerIdentifier = customer.contact_name || customer.company_name;

    try {
      console.log(
        `processCustomer(), Processing customer ${index + 1}: ${customerIdentifier}`,
      );

      // Do NOT check if customer exists here

      const result = await createCustomer(customer, options);

      if (!result.success) {
        if (result.reason === 'duplicate') {
          console.log(
            `processCustomer(), Customer ${index + 1} detected as duplicate. Fetching ID...`,
          );

          let existingCustomerId = null;
          try {
            // Only fetch ID if duplicate is detected
            const existingCustomer = await fetchCustomerFromZoho(
              customer.contact_name,
              customer.company_name,
              authToken,
            );
            existingCustomerId = existingCustomer?.customerId || null;
          } catch (err) {
            console.error(
              `processCustomer(), Failed to fetch existing customer ID: ${err.message}`,
            );
          }

          return {
            contactName: customer.contact_name,
            companyName: customer.company_name,
            customerId: existingCustomerId,
            status: 'existing_in_zoho',
            message: result.message,
          };
        } else {
          const errorMessage = `Failed to create customer: ${result.message}`;
          console.error(`processCustomer(), ${errorMessage}`);
          if (sendEmail) {
            sendEmail(
              `Error creating customer ${customerIdentifier}: ${result.message}`,
            );
          }
          return null;
        }
      } else {
        const customer_id = result.customer_id;
        console.log(
          `processCustomer(), Customer ${index + 1} created successfully with ID: ${customer_id}`,
        );

        return {
          contactName: customer.contact_name,
          companyName: customer.company_name,
          customerId: customer_id,
          status: 'created',
        };
      }
    } catch (error) {
      const errorMessage = `Error processing customer ${customerIdentifier}: ${error.message}`;
      console.error(`processCustomer(), ${errorMessage}`);

      if (sendEmail) {
        sendEmail(errorMessage);
      }

      return null;
    }
  };

  try {
    for (let i = 0; i < customersToProcess.length; i++) {
      const tasks = [];

      const batchSize = 10; // Process in batches of 10
      const end = Math.min(i + batchSize, customersToProcess.length);

      for (let j = i; j < end; j++) {
        const task = limit(async () => {
          if (j > i) {
            await delay(2000);
          }

          const result = await processCustomer(customersToProcess[j], j);
          if (result) {
            customerDetails.push(result);
          }
        });

        tasks.push(task);
      }

      await Promise.all(tasks);
      i = end - 1; // Skip ahead to next batch
    }

    console.log(
      `pushCustomerToZoho(), Finished processing ${customersToProcess.length} customers`,
    );
    return customerDetails.filter((detail) => detail !== null);
  } catch (error) {
    console.error(
      `pushCustomerToZoho(), Error in batch processing: ${error.message}`,
    );
    if (sendEmail) {
      sendEmail(`Error in batch processing: ${error.message}`);
    }
    throw error;
  }
}

export default pushCustomerToZoho;
