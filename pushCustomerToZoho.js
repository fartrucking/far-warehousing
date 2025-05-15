import https from 'https';
import fetchCustomerFromZoho from './fetchCustomerFromZoho.js';
import pLimit from 'p-limit';

const limit = pLimit(5);

// Function to add a delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pushCustomerToZoho(
  apiUrl,
  authToken,
  customerData,
  sendEmail = null,
) {
  console.log('customerData=>', customerData);

  const options = {
    hostname: 'www.zohoapis.com',
    headers: {
      Authorization: `Zoho-oauthtoken ${authToken}`,
      'Content-Type': 'application/json',
    },
  };

  let customerDetails = [];

  const customerDetailsPromises = customerData.map((customer, index) => {
    return new Promise(async (resolve) => {
      try {
        const requestBody = JSON.stringify({
          contact_name: customer.contact_name,
          company_name: customer.company_name,
          contact_type: customer.contact_type,
          billing_address: {
            attention: customer.billing_attention,
            address: customer.billing_address,
            city: customer.billing_city,
            state: customer.billing_state,
            zip: customer.billing_zip,
            country: customer.billing_country,
          },
          shipping_address: {
            attention: customer.shipping_attention,
            address: customer.shipping_address,
            city: customer.shipping_city,
            state: customer.shipping_state,
            zip: customer.shipping_zip,
            country: customer.shipping_country,
          },
          language_code: customer.language_code,
        });

        console.log(`Payload for customer ${index + 1}:`, requestBody);

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
                      resolve(response.contact.contact_id);
                    } else if (response.code === 3062) {
                      resolve(null); // Duplicate found
                    } else {
                      sendEmail(`Error creating customer: ${response.message}`);
                      reject(
                        new Error(
                          `Error creating customer: ${response.message}`,
                        ),
                      );
                    }
                  } catch (err) {
                    reject(new Error(`Error parsing response: ${err.message}`));
                  }
                });
              },
            );

            req.on('error', reject);
            req.write(requestBody);
            req.end();
          });

        const customer_id = await createCustomer();
        console.log('customer_id =>', customer_id);

        if (!customer_id) {
          console.log(
            `Customer ${index + 1} already exists. Updating details...`,
          );

          const existingCustomerId = await fetchCustomerFromZoho(
            customer.contact_name,
            customer.company_name,
            authToken,
          );
          console.log('existingCustomerId =>', existingCustomerId);

          const updateCustomer = () =>
            new Promise((resolve, reject) => {
              const req = https.request(
                {
                  ...options,
                  method: 'PUT',
                  path: `/inventory/v1/contacts/${existingCustomerId.customerId}?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
                },
                (res) => {
                  let body = '';
                  res.on('data', (chunk) => (body += chunk));
                  res.on('end', () => {
                    try {
                      const response = JSON.parse(body);
                      console.log('response ==>', response.message);
                      if (response.code === 0) {
                        resolve(existingCustomerId);
                      } else {
                        reject(
                          new Error(
                            `Error updating customer: ${response.message}`,
                          ),
                        );
                      }
                    } catch (err) {
                      reject(
                        new Error(`Error parsing response: ${err.message}`),
                      );
                    }
                  });
                },
              );

              req.on('error', reject);
              req.write(requestBody);
              req.end();
            });

          const updatedCustomerId = await updateCustomer();
          console.log(
            `Customer updated successfully with ID: ${updatedCustomerId}`,
          );
          console.log(
            `Customer updated successfully with ID: ${updatedCustomerId.customerId}`,
          );

          customerDetails.push({
            contactName: customer.contact_name,
            companyName: customer.company_name,
            customerId: updatedCustomerId,
          });

          resolve(updatedCustomerId);
        } else {
          console.log(
            `Customer ${index + 1} created successfully with ID: ${customer_id}`,
          );
          customerDetails.push({
            contactName: customer.contact_name,
            companyName: customer.company_name,
            customerId: customer_id,
          });
          resolve(customer_id);
        }
      } catch (error) {
        console.log('err=========>', error);
        console.error(
          `Error processing customer ${customer.contact_name ? customer.contact_name : customer.company_name}:`,
          error.message,
        );
        sendEmail(
          `Error processing customer ${customer.contact_name ? customer.contact_name : customer.company_name}:`,
          error.message,
        );
        resolve(null); // Continue processing other customers
      }
    });
  });

  try {
    // await Promise.all(customerDetailsPromises);

    // Wrap each promise with the concurrency limit
    // const limitedPromises = customerDetailsPromises.map((promise) =>
    //   limit(() => promise)
    // );

    const limitedPromises = customerDetailsPromises.map((promise) =>
      limit(async () => {
        await promise; // Await the promise
        await delay(5000); // Add 2000ms delay after the promise is resolved
      }),
    );

    // Await all promises with controlled concurrency
    await Promise.all(limitedPromises);

    return customerDetails.filter((detail) => detail !== null); // Filter out null values
  } catch (error) {
    console.error('Error pushing customers to Zoho:', error);
    throw error;
  }
}

export default pushCustomerToZoho;
