import https from 'https';
import fetchItemFromZoho from './fetchItemsFromZoho.js';
// import updateItemToZoho from "./updateItemToZoho.js";
import pLimit from 'p-limit';

const limit = pLimit(5);

// Delay function to pause between API calls
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Push or update items in Zoho
async function pushItemToZoho(apiUrl, authToken, itemdata, sendEmail = null) {
  console.log('pushItemToZoho() called itemData=>', itemdata);
  if (!Array.isArray(itemdata) || itemdata.length === 0) {
    throw new Error('Invalid item data: itemdata is not an array or is empty');
  }

  const options = {
    method: 'POST',
    hostname: 'www.zohoapis.com',
    path: `/inventory/v1/items?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
    headers: {
      Authorization: `Zoho-oauthtoken ${authToken}`,
      'Content-Type': 'application/json',
    },
  };

  const processItem = async (item) => {
    try {
      let item_id = '';
      // let response;

      // First, try to fetch the item to see if it exists
      const fetchedItem = await fetchItemFromZoho(
        item.sku,
        authToken,
        sendEmail,
      );

      if (fetchedItem && fetchedItem.itemId) {
        // Item exists, update it
        item_id = fetchedItem.itemId;
        console.log(`Item with SKU ${item.sku} found with ID: ${item_id}.`);

        // const payload = {
        //   sku: item.sku,
        //   name: item.name,
        //   item_type: item.item_type,
        //   product_type: item.product_type,
        //   unit: item.unit,
        //   initial_stock_rate: item.initial_stock_rate > 0 ? Number(item.initial_stock_rate) : 0.01,
        //   warehouse_name: item.warehouse_name,
        // };

        // response = await updateItemToZoho(item_id, authToken, payload);
        // console.log("Item updated successfully:", response.message);
      } else {
        // Item doesn't exist, create it
        console.log(`Item with SKU ${item.sku} not found, creating...`);

        const payload = {
          sku: item.sku,
          name: item.name,
          item_type: item.item_type,
          product_type: item.product_type,
          unit: item.unit,
          initial_stock: Number(item.initial_stock),
          initial_stock_rate:
            item.initial_stock_rate > 0
              ? Number(item.initial_stock_rate)
              : 0.01,
          warehouse_name: item.warehouse_name,
        };

        console.log('Payload being sent to Zoho:', payload);

        const createPromise = new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let body = '';

            res.on('data', (chunk) => {
              body += chunk;
            });

            res.on('end', () => {
              try {
                const response = JSON.parse(body);
                console.log('processItem() response:', response);

                if (response.code === 0 && response.item) {
                  resolve({
                    id: response.item.item_id,
                    success: true,
                    message: 'Item created successfully',
                  });
                } else if (response.code === 1001) {
                  // Item exists but we couldn't find it earlier,
                  // Try again to fetch by name
                  console.log(
                    `Unexpected state: Item exists but couldn't be fetched earlier. Retrying...`,
                  );
                  resolve({
                    id: null,
                    success: false,
                    message: response.message,
                  });
                } else {
                  reject(
                    new Error(`Failed to create item: ${response.message}`),
                  );
                }
              } catch (error) {
                reject(new Error(`Error parsing response: ${error.message}`));
              }
            });
          });

          req.on('error', (error) => {
            reject(new Error(`Request error: ${error.message}`));
          });

          req.write(JSON.stringify(payload));
          req.end();
        });

        const result = await createPromise;

        if (result.success) {
          item_id = result.id;
          console.log('Item created successfully with ID:', item_id);
        } else {
          throw new Error(`Failed to process item: ${result.message}`);
        }
      }

      return {
        sku: item.sku,
        name: item.name,
        itemId: item_id,
        initialStock: Number(item.initial_stock),
        itemUnit: item.unit,
      };
    } catch (error) {
      console.error(`Error processing item ${item.sku}:`, error.message);
      throw new Error(`Failed to process item ${item.sku}: ${error.message}`);
    }
  };

  try {
    const itemDetails = await Promise.all(
      itemdata.map(async (item) => {
        const result = await limit(async () => {
          const itemDetail = await processItem(item);
          await delay(5000); // Wait for 5000ms before processing the next item
          return itemDetail;
        });
        return result;
      }),
    );

    return itemDetails;
  } catch (error) {
    console.error('Error pushing items to Zoho:', error.message);
    throw new Error(`Error pushing items to Zoho: ${error.message}`);
  }
}

export default pushItemToZoho;
