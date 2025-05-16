import fetch from 'node-fetch';

export async function fetchCustomerFromZoho(
  contactName,
  companyName,
  newToken,
) {
  try {
    const encodedContactName = encodeURIComponent(contactName);
    const encodedCompanyName = encodeURIComponent(companyName);

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

    if (!customerData.contacts || customerData.contacts.length === 0) {
      console.warn('No customer found.');
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
