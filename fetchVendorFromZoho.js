import fetch from "node-fetch";
import refreshToken from "./refreshToken.js";

async function fetchVendorsFromZoho(newToken, sendEmail = null) {
  try {
    const apiUrl = `https://www.zohoapis.com/inventory/v1/contacts?organization_id=${process.env.ZOHO_ORGANIZATION_ID}&contact_type=vendor`;

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        Authorization: `Zoho-oauthtoken ${newToken}`,
      },
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `Failed to fetch vendors: ${response.status} ${response.statusText} - ${responseBody}`
      );
    }

    const vendorData = await response.json();

    if (!vendorData.contacts || vendorData.contacts.length === 0) {
      console.warn(`No vendors found`);
      return null;
    }

    // Filter only active vendors and map relevant fields
    const activeVendors = vendorData.contacts.map((vendor) => ({
      vendor_id: vendor.contact_id,
      vendor_name: vendor.vendor_name,
    }));

    return activeVendors.length > 0 ? activeVendors : null;
  } catch (error) {
    console.error(`Error fetching vendors: ${error.message}`);
    sendEmail(`Error fetching vendors: ${error.message}`);
    return null;
  }
}

export default fetchVendorsFromZoho;
