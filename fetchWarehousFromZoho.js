import fetch from 'node-fetch';
// import refreshToken from "./refreshToken.js";

async function fetchWarehousesFromZoho(newToken, sendEmail = null) {
  try {
    const apiUrl = `https://www.zohoapis.com/inventory/v1/settings/warehouses?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Zoho-oauthtoken ${newToken}`,
      },
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `Failed to fetch warehouses: ${response.status} ${response.statusText} - ${responseBody}`,
      );
    }

    const wareHousesData = await response.json();

    if (!wareHousesData.warehouses || wareHousesData.warehouses.length === 0) {
      console.warn(`No warehouses found`);
      return null;
    }

    return wareHousesData.warehouses.map((wh) => ({
      warehouse_id: wh.warehouse_id,
      warehouse_name: wh.warehouse_name,
    }));
  } catch (error) {
    console.error(`Error fetching warehouses: ${error.message}`);
    sendEmail(`Error fetching warehouses: ${error.message}`);
    return null;
  }
}

export default fetchWarehousesFromZoho;
