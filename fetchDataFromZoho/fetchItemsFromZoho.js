import fetch from 'node-fetch';
import { normalizeSku } from '../utils/normalizeUtils.js';

async function fetchItemFromZoho(sku, newToken, sendEmail = null) {
  console.log('fetchItemFromZoho(), sku:', sku);
  try {
    let page = 1;
    const per_page = 100;
    let hasMore = true;

    while (hasMore) {
      const apiUrl = `https://www.zohoapis.com/inventory/v1/items?organization_id=${process.env.ZOHO_ORGANIZATION_ID}&page=${page}&per_page=${per_page}`;

      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          Authorization: `Zoho-oauthtoken ${newToken}`,
        },
      });

      if (!response.ok) {
        const responseBody = await response.text();
        const warning = `Failed to fetch items (page ${page}): ${response.status} ${response.statusText} - ${responseBody}`;
        console.warn(warning);
        sendEmail?.(warning);
        return null;
      }

      const data = await response.json();
      const items = data.items || [];

      const foundItem = items.find(
        (item) => normalizeSku(item.sku) === normalizeSku(sku),
      );

      if (foundItem) {
        console.log(`Found item for SKU ${sku} on page ${page}`);
        return {
          itemId: foundItem.item_id,
          itemInitialStock: foundItem.actual_available_stock,
          itemUnit: foundItem.unit,
          zohoSku: foundItem.sku, // 👈 include actual SKU from Zoho
        };
      }

      hasMore = data.page_context?.has_more_page || false;
      page++;
    }

    console.log(`No items found for SKU: ${sku}`);
    // sendEmail(`No items found for SKU: ${sku}`);
    return null;
  } catch (error) {
    const errorMessage = `Error fetching item for SKU ${sku}: ${error.message}`;
    console.error(errorMessage);
    sendEmail?.(errorMessage);
    return null;
  }
}

export async function fetchItemById(itemId, newToken, sendEmail = null) {
  try {
    const apiUrl = `https://www.zohoapis.com/inventory/v1/items/${itemId}?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        Authorization: `Zoho-oauthtoken ${newToken}`,
      },
    });

    if (!response.ok) {
      const responseBody = await response.text();
      const warning = `Failed to fetch item by ID ${itemId}: ${response.status} ${response.statusText} - ${responseBody}`;
      console.warn(warning);
      // sendEmail?.(warning);
      return null;
    }

    const data = await response.json();
    return data.item || null;
  } catch (error) {
    const errorMessage = `Error fetching item by ID ${itemId}: ${error.message}`;
    console.error(errorMessage);
    sendEmail?.(errorMessage);
    return null;
  }
}

export default fetchItemFromZoho;
