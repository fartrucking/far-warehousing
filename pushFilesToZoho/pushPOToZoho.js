import https from 'https';
import pLimit from 'p-limit';
import fetchItemFromZoho, {
  fetchItemById,
} from '../fetchDataFromZoho/fetchItemsFromZoho.js';
import { normalizeSku, normalizeString } from '../utils/normalizeUtils.js';
import { fetchAllPurchaseOrders } from '../fetchDataFromZoho/fetchAllPurchaseOrders.js';

const limit = pLimit(5);

// Delay function to pause between API calls
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pushPOToZoho(
  apiUrl,
  authToken,
  podata,
  vendors,
  wareHouses,
  itemData,
  sendEmail = null,
) {
  console.log('itemData=>', itemData);
  const getOptions = {
    method: 'GET',
    hostname: 'www.zohoapis.com',
    path: `/inventory/v1/purchaseorders?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
    headers: {
      Authorization: `Zoho-oauthtoken ${authToken}`,
    },
  };

  const createOptions = {
    method: 'POST',
    hostname: 'www.zohoapis.com',
    path: `/inventory/v1/purchaseorders?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
    headers: {
      Authorization: `Zoho-oauthtoken ${authToken}`,
      'Content-Type': 'application/json',
    },
  };

  const updateOptions = (poId) => ({
    method: 'PUT',
    hostname: 'www.zohoapis.com',
    path: `/inventory/v1/purchaseorders/${poId}?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
    headers: {
      Authorization: `Zoho-oauthtoken ${authToken}`,
      'Content-Type': 'application/json',
    },
  });

  async function createOrUpdatePO(poDetails, existingPOs) {
    return new Promise(async (resolve, reject) => {
      try {
        const existingPO = existingPOs?.find(
          (po) => po.purchaseorder_number === poDetails.purchaseorder_number,
        );

        if (existingPO) {
          const req = https.request(
            updateOptions(existingPO.purchaseorder_id),
            (res) => {
              let body = '';

              res.on('data', (chunk) => {
                body += chunk;
              });

              res.on('end', async () => {
                try {
                  const response = JSON.parse(body);
                  if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`PO updated successfully: ${response.message}`);
                    // updatePOItemStock(itemData, poDetails, authToken).catch(
                    //   console.error
                    // );
                    resolve(response);
                  } else {
                    reject(
                      new Error(`Failed to update PO: ${response.message}`),
                    );
                  }
                } catch (error) {
                  reject(
                    new Error(
                      `Error parsing update response: ${error.message}`,
                    ),
                  );
                }
              });
            },
          );

          req.write(JSON.stringify(poDetails));
          req.end();
        } else {
          const req = https.request(createOptions, (res) => {
            let body = '';

            res.on('data', (chunk) => {
              body += chunk;
            });

            res.on('end', async () => {
              try {
                const response = JSON.parse(body);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                  console.log(`PO created successfully: ${response.message}`);
                  // updatePOItemStock(itemData, poDetails, authToken).catch(
                  //   console.error
                  // );
                  resolve(response);
                } else {
                  console.log('createOrUpdatePO response=>', response);
                  reject(new Error(`Failed to create PO: ${response.message}`));
                }
              } catch (error) {
                reject(
                  new Error(
                    `Error parsing creation response: ${error.message}`,
                  ),
                );
              }
            });
          });

          req.write(JSON.stringify(poDetails));
          req.end();
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  const groupPOData = async (podata) => {
    console.log('Original podata=>', podata);

    // First, ensure we have a proper array to work with
    let dataArray = [];

    try {
      // If podata is a string with format like "podata [{ }, { }]"
      if (
        typeof podata === 'string' &&
        podata.includes('[') &&
        podata.includes(']')
      ) {
        // Extract just the array part
        const arrayPart = podata.substring(
          podata.indexOf('['),
          podata.lastIndexOf(']') + 1,
        );
        try {
          // Try to parse as JSON
          dataArray = JSON.parse(arrayPart);
        } catch (parseError) {
          console.error('Error parsing array part:', parseError);
          // If JSON parsing fails, try a simpler approach - just eval it
          // Note: Using eval is generally not recommended for security reasons
          // but may be necessary in this specific context
          dataArray = eval(arrayPart);
        }
      } else if (Array.isArray(podata)) {
        // If it's already an array, use it directly
        dataArray = podata;
      } else if (typeof podata === 'object') {
        // If it's an object, it might be an object with the array as a property
        if (podata.hasOwnProperty('podata') && Array.isArray(podata.podata)) {
          dataArray = podata.podata;
        } else {
          // Or it might be a single object, so wrap it in an array
          dataArray = [podata];
        }
      }
    } catch (error) {
      console.error('Error processing podata:', error);
      return [];
    }

    console.log('Processed dataArray=>', dataArray);
    console.log('Array length:', dataArray.length);

    // Handle empty or invalid data
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      console.warn('No valid data to process');
      return [];
    }

    const processedPOs = [];
    const errorPOs = [];

    // Process each PO
    for (const po of dataArray) {
      try {
        // Skip empty objects
        if (!po || Object.keys(po).length === 0) {
          console.warn('Skipping empty PO object');
          continue;
        }

        // Skip entries without a purchase order number
        if (!po.purchaseorder_number) {
          console.warn('Skipping entry without purchaseorder_number:', po);
          continue;
        }

        const warehouse =
          wareHouses?.find(
            (wh) =>
              normalizeString(wh.warehouse_name) ===
              normalizeString(po.warehouse_name),
          ) || {};

        const warehouseId = warehouse.warehouse_id || '';
        const warehouseName = warehouse.warehouse_name || po.warehouse_name;

        // Find vendor with case-insensitive comparison
        const vendor = vendors?.find(
          (v) =>
            normalizeString(v.vendor_name) === normalizeString(po.vendor_name),
        );
        const vendorId = vendor?.vendor_id || '';

        if (!warehouseId) {
          throw new Error(
            `Missing warehouseId for PO: ${po.purchaseorder_number}`,
          );
        }

        if (!vendorId) {
          throw new Error(
            `Missing vendorId for PO: ${po.purchaseorder_number}, vendor: ${po.vendor_name}`,
          );
        }

        const item =
          itemData?.find(
            (item) => normalizeSku(item.sku) === normalizeSku(po.sku),
          ) || {};

        let itemID = item.itemId || '';
        // const itemUnit = item.itemUnit;

        let unitConversions = [];
        let unitConversionId;
        let unitConversionRate = 0;

        // Only fetch item data if we have a valid itemID
        if (itemID) {
          try {
            const fetchedItemData = await fetchItemById(itemID, authToken);
            unitConversions =
              fetchedItemData?.item?.unit_conversions ||
              fetchedItemData?.unit_conversions ||
              [];
            console.log('PO unitConversions=>', unitConversions);

            if (unitConversions && unitConversions.length > 0) {
              // Process each unit conversion
              unitConversions.forEach((conversion) => {
                if (conversion.target_unit === po.unit) {
                  unitConversionId = conversion.unit_conversion_id;
                  unitConversionRate = conversion.conversion_rate;
                }
              });
            } else {
              console.log('No unit conversions found');
            }
          } catch (fetchError) {
            console.warn(
              `Error fetching item data for ${itemID}:`,
              fetchError.message,
            );
          }
        }

        if (!itemID) {
          // Try to fetch itemId using fetchItemFromZoho
          const fetchedItem = await fetchItemFromZoho(
            po.sku,
            authToken,
            sendEmail,
          );
          if (fetchedItem && fetchedItem.itemId) {
            itemID = fetchedItem.itemId;
          } else {
            throw new Error(
              `Item ID not found for SKU: ${po.sku}, check if item exists in Zoho.`,
            );
          }
          // throw new Error(`Missing itemId for SKU: ${po.sku}`);
        }

        const lineItem = {
          item_id: itemID,
          sku: po.sku,
          name: item.name || po.item_name,
          quantity: Number(po.quantity_received),
          unit: po.unit,
          item_total: Number(po.item_total),
          warehouse_id: warehouseId,
        };

        if (unitConversionId) {
          lineItem.unit_conversion_id = unitConversionId;
          lineItem.rate = unitConversionRate;
        }

        // Check if we already have this PO in our processed list
        const existingPO = processedPOs.find(
          (p) => p.purchaseorder_number === po.purchaseorder_number,
        );

        if (existingPO) {
          // Add this line item to the existing PO
          existingPO.line_items.push(lineItem);
        } else {
          // Create a new PO entry
          const today = new Date().toISOString().split('T')[0];
          processedPOs.push({
            purchaseorder_number: po.purchaseorder_number,
            date: po.purchaseorder_date,
            // Assuming po is the purchase order object that contains both dates
            delivery_date:
              new Date(po.delivery_date) < new Date(po.purchaseorder_date)
                ? po.purchaseorder_date // Set to purchase order date if delivery date is before it
                : new Date(po.delivery_date) < new Date()
                  ? today // Set to today if delivery date is in the past
                  : po.delivery_date, // Otherwise keep the original delivery date
            vendor_id: vendorId,
            attention: warehouseName,
            delivery_org_address_id: warehouseId,
            line_items: [lineItem],
          });
        }
      } catch (error) {
        console.error(
          `Error processing PO ${po?.purchaseorder_number || 'unknown'}: ${error.message}`,
        );
        errorPOs.push({
          purchaseorder_number: po?.purchaseorder_number || 'unknown',
          error: error.message,
        });
      }
    }

    // If all POs failed, throw an error
    if (processedPOs.length === 0 && errorPOs.length > 0) {
      throw new Error(`All POs failed processing: ${JSON.stringify(errorPOs)}`);
    }

    // Log errors but continue with valid POs
    if (errorPOs.length > 0) {
      console.warn(`Some POs had errors: ${JSON.stringify(errorPOs)}`);
      sendEmail(`Some POs had errors: ${JSON.stringify(errorPOs)}`);
    }

    console.log('Successfully processed POs:', processedPOs.length);
    return processedPOs;
  };

  let groupedPOData = [];
  try {
    groupedPOData = await groupPOData(podata); // <-- Add 'await' here
    console.log('groupedPOData =>', JSON.stringify(groupedPOData, null, 2));

    if (groupedPOData.length === 0) {
      console.warn('No valid POs to process after validation');
      return [];
    }
  } catch (error) {
    console.error('Error grouping PO data:', error.message);
    throw error;
  }

  try {
    const existingPOs = await fetchAllPurchaseOrders(authToken);

    if (groupedPOData.length === 0) {
      console.log('No valid POs to process.');
      return [];
    }

    const results = await Promise.all(
      groupedPOData.map((poDetails) =>
        limit(async () => {
          await delay(5000); // Delay between API calls
          return createOrUpdatePO(poDetails, existingPOs);
        }),
      ),
    );

    console.log('All POs processed successfully.');
    return results;
  } catch (error) {
    console.error('Error processing POs:', error.message);
    throw error; // Propagate the error to the caller
  }
}

export default pushPOToZoho;
