import https from 'https';
import fetchCustomerFromZoho from './fetchCustomerFromZoho.js';
import pLimit from 'p-limit';

const limit = pLimit(5);

// Function to add a delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Checks if a customer exists in the customers array based on name matching
 * @param {Object} newCustomer - The customer to check
 * @param {Array} existingCustomers - Array of existing customers
 * @returns {Object|null} - Matching customer or null
 */
function findExistingCustomer(newCustomer, existingCustomers) {
  if (
    !existingCustomers ||
    !Array.isArray(existingCustomers) ||
    existingCustomers.length === 0
  ) {
    return null;
  }

  // Safety check for newCustomer
  if (!newCustomer) {
    return null;
  }

  // Normalize the names for comparison
  const normalizeForComparison = (name) => {
    if (!name || typeof name !== 'string') return '';
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  };

  const newContactName = normalizeForComparison(newCustomer.contact_name);
  const newCompanyName = normalizeForComparison(newCustomer.company_name);

  // If both names are empty, we can't match
  if (!newContactName && !newCompanyName) {
    return null;
  }

  // Try to find a match
  return (
    existingCustomers.find((c) => {
      // Safety check for customers with missing properties
      if (!c) return false;

      const existingContactName = normalizeForComparison(c.contact_name);
      const existingCompanyName = normalizeForComparison(
        c.company_name || c.customer_name,
      );

      // Match on contact name if both exist and match
      const contactMatch =
        newContactName &&
        existingContactName &&
        existingContactName === newContactName;

      // Match on company name if both exist and match
      const companyMatch =
        newCompanyName &&
        existingCompanyName &&
        existingCompanyName === newCompanyName;

      return contactMatch || companyMatch;
    }) || null
  );
}

/**
 * Pushes customer data to Zoho, checking for duplicates both locally and remotely
 * @param {string} apiUrl - Base API URL
 * @param {string} authToken - Zoho authentication token
 * @param {Array} customerData - Array of customer data to push
 * @param {Array|null} existingCustomers - Optional array of existing customers to check against
 * @param {Function|null} sendEmail - Optional function to send email notifications
 * @returns {Array} - Details of processed customers
 */
async function pushCustomerToZoho(
  apiUrl,
  authToken,
  customerData,
  existingCustomers = null,
  sendEmail = null,
) {
  console.log('Processing customers to push to Zoho...');

  // Validate inputs
  if (!authToken) {
    const error = new Error('Auth token is required');
    console.error(error);
    throw error;
  }

  if (
    !customerData ||
    !Array.isArray(customerData) ||
    customerData.length === 0
  ) {
    console.log('No customers to process');
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
  let customersToProcess = [...customerData];

  // First check against existing customers if provided
  if (
    existingCustomers &&
    Array.isArray(existingCustomers) &&
    existingCustomers.length > 0
  ) {
    console.log(
      `Checking against ${existingCustomers.length} existing customers...`,
    );

    customersToProcess = customerData.filter((newCustomer) => {
      // Skip invalid customer data
      if (
        !newCustomer ||
        (!newCustomer.contact_name && !newCustomer.company_name)
      ) {
        console.log('Skipping invalid customer data:', newCustomer);
        return false;
      }

      const existingCustomer = findExistingCustomer(
        newCustomer,
        existingCustomers,
      );

      if (existingCustomer) {
        console.log(
          `Customer already exists: ${
            newCustomer.contact_name || newCustomer.company_name
          } (ID: ${existingCustomer.contact_id})`,
        );

        // Add to results with existing ID
        customerDetails.push({
          contactName: newCustomer.contact_name,
          companyName: newCustomer.company_name,
          customerId: existingCustomer.contact_id,
          status: 'existing',
        });

        return false; // Don't process this customer
      }

      return true; // Customer needs to be processed
    });

    console.log(`${customersToProcess.length} new customers to be processed.`);
  }

  /**
   * Process a single customer
   * @param {Object} customer - Customer data
   * @param {number} index - Index in the array
   * @returns {Object|null} - Customer details or null if failed
   */
  const processCustomer = async (customer, index) => {
    if (!customer || (!customer.contact_name && !customer.company_name)) {
      console.log(`Skipping invalid customer at index ${index}`);
      return null;
    }

    try {
      // First check if customer exists in Zoho using the fetch function
      let existingCustomerId = null;
      try {
        const existingCustomer = await fetchCustomerFromZoho(
          customer.contact_name,
          customer.company_name,
          authToken,
        );

        existingCustomerId = existingCustomer?.customerId || null;
      } catch (fetchError) {
        console.error(
          `Error checking if customer exists: ${fetchError.message}`,
        );
        // Continue with creation attempt if we can't determine if the customer exists
      }

      if (existingCustomerId) {
        console.log(
          `Customer found in Zoho: ${
            customer.contact_name || customer.company_name
          } (ID: ${existingCustomerId})`,
        );

        return {
          contactName: customer.contact_name,
          companyName: customer.company_name,
          customerId: existingCustomerId,
          status: 'existing_in_zoho',
        };
      }

      // If no existing customer, prepare to create a new one
      const requestBody = JSON.stringify({
        contact_name: customer.contact_name || '',
        company_name: customer.company_name || '',
        contact_type: customer.contact_type || 'customer', // Default to 'customer' if not specified
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
      });

      console.log(
        `Creating new customer ${index + 1}: ${
          customer.contact_name || customer.company_name
        }`,
      );

      const createCustomer = () =>
        new Promise((resolve, reject) => {
          const req = https.request(
            {
              ...options,
              method: 'POST',
              path: `/inventory/v1/contacts?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
            },
            (res) => {
              let body = '';
              res.on('data', (chunk) => (body += chunk));
              res.on('end', () => {
                try {
                  const response = JSON.parse(body);
                  if (response.code === 0) {
                    resolve({
                      success: true,
                      customer_id: response.contact.contact_id,
                    });
                  } else if (response.code === 3062) {
                    // Duplicate customer found during creation
                    console.log(
                      `Duplicate detected during creation: ${
                        customer.contact_name || customer.company_name
                      }`,
                    );
                    resolve({
                      success: false,
                      reason: 'duplicate',
                      message: response.message || 'Duplicate contact',
                    });
                  } else {
                    // Other error
                    resolve({
                      success: false,
                      reason: 'error',
                      message: response.message || 'Unknown error',
                    });
                  }
                } catch (err) {
                  reject(new Error(`Error parsing response: ${err.message}`));
                }
              });
            },
          );

          req.on('error', (error) => {
            reject(new Error(`Network error: ${error.message}`));
          });

          req.write(requestBody);
          req.end();
        });

      try {
        const result = await createCustomer();

        if (!result.success) {
          if (result.reason === 'duplicate') {
            console.log(
              `Customer ${index + 1} already exists in Zoho. Fetching ID...`,
            );

            // Try to fetch the customer ID again
            let existingCustomerId = null;
            try {
              const existingCustomer = await fetchCustomerFromZoho(
                customer.contact_name,
                customer.company_name,
                authToken,
              );

              existingCustomerId = existingCustomer?.customerId || null;
            } catch (err) {
              console.error(
                `Failed to fetch existing customer ID: ${err.message}`,
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
            // Handle other failures
            console.error(`Failed to create customer: ${result.message}`);
            if (sendEmail) {
              sendEmail(
                `Error creating customer ${
                  customer.contact_name || customer.company_name
                }: ${result.message}`,
              );
            }
            return null;
          }
        } else {
          const customer_id = result.customer_id;
          console.log(
            `Customer ${index + 1} created successfully with ID: ${customer_id}`,
          );

          return {
            contactName: customer.contact_name,
            companyName: customer.company_name,
            customerId: customer_id,
            status: 'created',
          };
        }
      } catch (createError) {
        console.error(`Error creating customer: ${createError.message}`);
        if (sendEmail) {
          sendEmail(
            `Error creating customer ${
              customer.contact_name || customer.company_name
            }: ${createError.message}`,
          );
        }
        return null;
      }
    } catch (error) {
      console.error(
        `Error processing customer ${
          customer.contact_name || customer.company_name
        }:`,
        error.message,
      );

      if (sendEmail) {
        sendEmail(
          `Error processing customer ${
            customer.contact_name || customer.company_name
          }: ${error.message}`,
        );
      }

      return null; // Continue processing other customers
    }
  };

  try {
    // Process customers with concurrency limit and delay
    const processingPromises = [];

    for (let i = 0; i < customersToProcess.length; i++) {
      const processPromise = limit(async () => {
        try {
          const result = await processCustomer(customersToProcess[i], i);
          if (result) {
            customerDetails.push(result);
          }
        } catch (err) {
          console.error(
            `Unexpected error processing customer at index ${i}:`,
            err,
          );
        }

        if (i < customersToProcess.length - 1) {
          await delay(5000); // 5 second delay between requests
        }
      });

      processingPromises.push(processPromise);
    }

    await Promise.all(processingPromises);

    return customerDetails.filter((detail) => detail !== null);
  } catch (error) {
    console.error('Error pushing customers to Zoho:', error);
    if (sendEmail) {
      sendEmail('Error pushing customers to Zoho: ' + error.message);
    }
    throw error;
  }
}

export default pushCustomerToZoho;
