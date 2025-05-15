import fetch from 'node-fetch';
import refreshToken from './refreshToken.js';

export async function fetchCustomerFromZoho(
  contactName,
  companyName,
  newToken,
) {
  try {
    const encodedContactName = encodeURIComponent(contactName);
    const encodedCompanyName = encodeURIComponent(companyName);
    // console.log("encodedContactName=>", encodedContactName);
    // console.log("encodedCompanyName=>", encodedCompanyName);

    const apiUrl = `https://www.zohoapis.com/inventory/v1/contacts?organization_id=${process.env.ZOHO_ORGANIZATION_ID}&contact_name_contains=${encodedContactName ? encodedContactName : encodedCompanyName}&company_name_contains=${encodedCompanyName ? encodedCompanyName : encodedContactName}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Zoho-oauthtoken ${newToken}`,
      },
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `Failed to fetch customer: ${response.status} ${response.statusText} - ${responseBody}`,
      );
    }

    const customerData = await response.json();
    // console.log("customerData=================================>", customerData);

    if (!customerData.contacts || customerData.contacts.length === 0) {
      console.warn('No customer found.');
      // const allCust = await fetchAllCustomersFromZoho(newToken);
      // console.log("allCust=>", allCust);
      return null;
    }

    // Find exact match for contact name or company name
    const exactMatch = customerData.contacts.find(
      (contact) =>
        contact.contact_name === contactName ||
        contact.company_name === companyName,
    );

    // If exact match found, use it; otherwise fallback to first result
    const customer = exactMatch || customerData.contacts[0];
    console.log('Customer cust fetched from Zoho:', customer);
    console.log('Customer fetched from Zoho:', customer.contact_id);

    return {
      customerId: customer.contact_id,
      billing_ID: customer.billing_address?.[0]?.address_id || null,
      shipping_ID: customer.shipping_address?.[0]?.address_id || null,
    };
  } catch (error) {
    console.error(`Error fetching customer: ${error.message}`);
    return null;
  }
}

// export async function fetchAllCustomersFromZoho(newToken) {
//   try {
//     const apiUrl = `https://www.zohoapis.in/billing/v1/customers?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`;

//     const response = await fetch(apiUrl, {
//       method: "GET",
//       headers: {
//         Authorization: `Zoho-oauthtoken ${newToken}`,
//       },
//     });

//     if (!response.ok) {
//       const responseBody = await response.text();
//       throw new Error(
//         `Failed to fetch customers: ${response.status} ${response.statusText} - ${responseBody}`
//       );
//     }

//     const customerData = await response.json();

//     if (!customerData.customers || customerData.customers.length === 0) {
//       console.warn("No customers found.");
//       return [];
//     }

//     console.log(`Fetched ${customerData.customers.length} customers from Zoho`);

//     return customerData.customers.map((customer) => ({
//       customerId: customer.customer_id,
//       displayName: customer.display_name,
//       firstName: customer.first_name || "",
//       lastName: customer.last_name || "",
//       email: customer.email || "",
//       companyName: customer.company_name || "",
//       phone: customer.phone || "",
//       mobile: customer.mobile || "",
//       website: customer.website || "",
//       tags: customer.tags || [],
//     }));
//   } catch (error) {
//     console.error(`Error fetching customers: ${error.message}`);
//     return [];
//   }
// }

export async function fetchAllCustomersFromZoho(newToken) {
  const allCustomers = [];
  let page = 1;
  const perPage = 200;
  let hasMorePage = true;

  try {
    while (hasMorePage) {
      const apiUrl = `https://www.zohoapis.com/inventory/v1/customers?organization_id=${process.env.ZOHO_ORGANIZATION_ID}&per_page=${perPage}&page=${page}`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${newToken}`,
        },
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(
          `Failed to fetch customers: ${response.status} ${response.statusText} - ${responseBody}`,
        );
      }

      const data = await response.json();
      const contacts = data.contacts || [];

      allCustomers.push(...contacts);

      hasMorePage = data.page_context?.has_more_page;
      page++;
    }

    console.log(`Fetched total ${allCustomers.length} customers.`);
    return allCustomers;
  } catch (error) {
    console.error(`Error fetching customers: ${error.message}`);
    return [];
  }
}

export default fetchCustomerFromZoho;
