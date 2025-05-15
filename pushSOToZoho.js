import https from 'https';
import refreshToken from './refreshToken.js';
import fetchItemFromZoho, { fetchItemById } from './fetchItemsFromZoho.js';
import updateItemStock from './updateItemStockToZoho.js';
import pLimit from 'p-limit';

const limit = pLimit(1);

// Delay function to pause between calls
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to get all existing sales orders
async function getAllSalesOrders(authToken) {
  const options = {
    method: 'GET',
    hostname: 'www.zohoapis.com',
    path: `/inventory/v1/salesorders?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
    headers: {
      Authorization: `Zoho-oauthtoken ${authToken}`,
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log('Fetched existing sales orders successfully.');
            resolve(response.salesorders || []);
          } else {
            console.error('Error fetching sales orders:', response);
            reject(new Error('Failed to fetch existing sales orders.'));
          }
        } catch (parseError) {
          console.error('Error parsing fetched sales orders:', parseError);
          reject(parseError);
        }
      });

      res.on('error', (error) => {
        console.error('Network error fetching sales orders:', error);
        reject(error);
      });
    });

    req.end();
  });
}

// async function updateSOItemStock(itemID, itemInitialStock, soDetails, authToken) {
//   // Group line items by SKU and sum the quantities
//   const groupedLineItems = soDetails.line_items.reduce((acc, soItem) => {
//     const existingItem = acc[soItem.sku];
//     if (existingItem) {
//       existingItem.quantity += soItem.quantity;
//     } else {
//       acc[soItem.sku] = { ...soItem };
//     }
//     return acc;
//   }, {});

//   const updatePromises = Object.values(groupedLineItems).map(async (soItem) => {
//     // const item =
//     //   itemData.find((item) => String(item.sku).trim() === String(soItem.sku).trim()) || {};

//     // const itemID = item.itemId || "";
//     // const itemInitialStock = item.initialStock || "";
//     const so_stock = soItem.quantity || 0;

//     if (itemID) {
//       console.log(`Updating stock for SKU: ${soItem.sku}, Item ID: ${itemID}, Total Quantity: ${so_stock}`);
//       await delay(10000);
//       return await updateItemStock(itemID, itemInitialStock, authToken, 0, so_stock);
//     } else {
//       console.warn(`No match found for SKU: ${soItem.sku}, skipping update.`);
//     }
//   });

//   await Promise.all(updatePromises);
//   console.log("✅ All items processed.");
// }

// Function to create or update the Sales Order (SO)
// async function createOrUpdateSO(
//   soDetails,
//   existingSOs,
//   customers,
//   wareHouses,
//   authToken,
//   resolve,
//   reject
// ) {
//   console.log("soDetails=>", soDetails);
//   const createOptions = {
//     method: "POST",
//     hostname: "www.zohoapis.com",
//     path: `/inventory/v1/salesorders?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
//     headers: {
//       Authorization: `Zoho-oauthtoken ${authToken}`,
//       "Content-Type": "application/json",
//     },
//   };

//   const updateOptions = (soId) => ({
//     method: "PUT",
//     hostname: "www.zohoapis.com",
//     path: `/inventory/v1/salesorders/${soId}?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
//     headers: {
//       Authorization: `Zoho-oauthtoken ${process.env.ZOHO_AUTH_TOKEN}`,
//       "Content-Type": "application/json",
//     },
//   });

//   // Find if the sales order already exists
//   const existingSO = existingSOs.find(
//     (so) => so.salesorder_number === soDetails.salesorder_number
//   );

//   if (existingSO) {
//     console.log(
//       `Sales order already exists with number: ${soDetails.salesorder_number}`
//     );
//   }

//   let itemId = null;
//   let itemInitialStock = null;

//   // Prepare item ID, customer ID, and warehouse ID
//   try {
//     const fetchedItem =
//       (await fetchItemFromZoho(soDetails.sku, authToken)) || {};
//     itemId = fetchedItem.itemId || null;
//     itemInitialStock = fetchedItem.itemInitialStock || null;

//     if (itemId) {
//       console.log(`Item ID fetched for SKU ${soDetails.sku}:`, itemId);
//     } else {
//       console.warn(`No Item ID found for SKU ${soDetails.sku}.`);
//     }

//     if (itemInitialStock !== undefined) {
//       console.log(`Initial stock for SKU ${soDetails.sku}:`, itemInitialStock);
//     } else {
//       console.warn(`Initial stock not available for SKU ${soDetails.sku}.`);
//     }
//   } catch (error) {
//     console.error(
//       `Error fetching item details for SKU ${soDetails.sku}:`,
//       error.message
//     );
//   }

//   const soPayload = soDetails;
//   console.log("soPayload=>", soPayload);

//   if (existingSO) {
//     console.log(`Updating existing SO: ${soDetails.salesorder_number}`);
//     const req = https.request(
//       updateOptions(existingSO.salesorder_id),
//       (res) => {
//         let body = "";

//         res.on("data", (chunk) => {
//           body += chunk;
//         });

//         res.on("end", async () => {
//           try {
//             const response = JSON.parse(body);
//             if (res.statusCode >= 200 && res.statusCode < 300) {
//               console.log(
//                 `SO updated successfully. Response:`,
//                 response.message
//               );
//               // const so_stock = Number(soDetails.item_quantity); // SO stock is the quantity billed
//               // await updateItemStock(
//               //   itemId,
//               //   itemInitialStock,
//               //   authToken,
//               //   0,
//               //   so_stock
//               // ); // Passing 0 for PO stock

//               updateSOItemStock(itemId, itemInitialStock, soDetails, authToken).catch(
//                 console.error
//               );

//               resolve(response);
//             } else {
//               console.error("Error updating SO:", response);
//               reject(
//                 new Error(`API Error: ${res.statusCode} - ${response.message}`)
//               );
//             }

//             // Add a delay between requests to avoid exceeding the rate limit
//             // await processRequest;
//             await delay(5000); // Wait 2 seconds between each request
//           } catch (parseError) {
//             console.error("Error parsing update response:", parseError);
//             reject(parseError);
//           }
//         });

//         res.on("error", (error) => {
//           console.error("Network error updating SO:", error);
//           reject(error);
//         });
//       }
//     );

//     req.write(JSON.stringify(soPayload));
//     req.end();
//   } else {
//     console.log(`Creating new SO: ${soDetails.salesorder_number}`);
//     const req = https.request(createOptions, (res) => {
//       let body = "";

//       res.on("data", (chunk) => {
//         body += chunk;
//       });

//       res.on("end", async () => {
//         try {
//           const response = JSON.parse(body);
//           console.log("response SO=>", response);
//           if (res.statusCode >= 200 && res.statusCode < 300) {
//             console.log(`SO created successfully. Response:`, response.message);

//             // const so_stock = Number(soDetails.item_quantity); // SO stock is the quantity billed
//             updateSOItemStock(itemId, itemInitialStock, soDetails, authToken).catch(
//               console.error
//             );
//             // await updateItemStock(
//             //   itemId,
//             //   itemInitialStock,
//             //   authToken,
//             //   0,
//             //   so_stock
//             // ); // Passing 0 for PO stock
//             resolve(response);
//           } else {
//             console.error("Error creating SO:", response);
//             reject(
//               new Error(`API Error: ${res.statusCode} - ${response.message}`)
//             );
//           }
//           await delay(5000);
//         } catch (parseError) {
//           console.error("Error parsing creation response:", parseError);
//           reject(parseError);
//         }
//       });

//       res.on("error", (error) => {
//         console.error("Network error creating SO:", error);
//         reject(error);
//       });
//     });

//     req.write(JSON.stringify(soPayload));
//     req.end();
//   }
// }

// async function createOrUpdateSO(
//   soDetails,
//   existingSOs,
//   customers,
//   wareHouses,
//   authToken,
//   resolve,
//   reject,
//   sendEmail = null
// ) {
//   console.log("soDetails=>", soDetails);
//   const createOptions = {
//     method: "POST",
//     hostname: "www.zohoapis.com",
//     path: `/inventory/v1/salesorders?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
//     headers: {
//       Authorization: `Zoho-oauthtoken ${authToken}`,
//       "Content-Type": "application/json",
//     },
//   };

//   const updateOptions = (soId) => ({
//     method: "PUT",
//     hostname: "www.zohoapis.com",
//     path: `/inventory/v1/salesorders/${soId}?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
//     headers: {
//       Authorization: `Zoho-oauthtoken ${process.env.ZOHO_AUTH_TOKEN}`,
//       "Content-Type": "application/json",
//     },
//   });

//   // Find if the sales order already exists
//   const existingSO = existingSOs.find(
//     (so) => so.salesorder_number === soDetails.salesorder_number
//   );

//   if (existingSO) {
//     console.log(
//       `Sales order already exists with number: ${soDetails.salesorder_number}`
//     );
//   }

//   let itemId = null;
//   let itemInitialStock = null;

//   // Prepare item ID, customer ID, and warehouse ID
//   try {
//     const fetchedItem =
//       (await fetchItemFromZoho(soDetails.sku, authToken, sendEmail)) || {};
//     itemId = fetchedItem.itemId || null;
//     itemInitialStock = fetchedItem.itemInitialStock || null;

//     if (itemId) {
//       console.log(`Item ID fetched for SKU ${soDetails.sku}:`, itemId);
//     } else {
//       console.warn(`No Item ID found for SKU ${soDetails.sku}.`);
//     }

//     if (itemInitialStock !== undefined) {
//       console.log(`Initial stock for SKU ${soDetails.sku}:`, itemInitialStock);
//     } else {
//       console.warn(`Initial stock not available for SKU ${soDetails.sku}.`);
//     }
//   } catch (error) {
//     console.error(
//       `Error fetching item details for SKU ${soDetails.sku}:`,
//       error.message
//     );
//   }

//   const soPayload = soDetails;
//   console.log("soPayload=>", soPayload);

//   if (existingSO) {
//     console.log(`Updating existing SO: ${soDetails.salesorder_number}`);
//     const req = https.request(
//       updateOptions(existingSO.salesorder_id),
//       (res) => {
//         let body = "";

//         res.on("data", (chunk) => {
//           body += chunk;
//         });

//         res.on("end", async () => {
//           try {
//             const response = JSON.parse(body);
//             if (res.statusCode >= 200 && res.statusCode < 300) {
//               console.log(
//                 `SO updated successfully. Response:`,
//                 response.message
//               );
//               // const so_stock = Number(soDetails.item_quantity); // SO stock is the quantity billed
//               // await updateItemStock(
//               //   itemId,
//               //   itemInitialStock,
//               //   authToken,
//               //   0,
//               //   so_stock
//               // ); // Passing 0 for PO stock

//               resolve(response);
//             } else {
//               console.error("Error updating SO:", response);
//               reject(
//                 new Error(`API Error: ${res.statusCode} - ${response.message}`)
//               );
//             }

//             // Add a delay between requests to avoid exceeding the rate limit
//             // await processRequest;
//             await delay(5000); // Wait 2 seconds between each request
//           } catch (parseError) {
//             console.error("Error parsing update response:", parseError);
//             reject(parseError);
//           }
//         });

//         res.on("error", (error) => {
//           console.error("Network error updating SO:", error);
//           reject(error);
//         });
//       }
//     );

//     req.write(JSON.stringify(soPayload));
//     req.end();
//   } else {
//     console.log(`Creating new SO: ${soDetails.salesorder_number}`);
//     const req = https.request(createOptions, (res) => {
//       let body = "";

//       res.on("data", (chunk) => {
//         body += chunk;
//       });

//       res.on("end", async () => {
//         try {
//           const response = JSON.parse(body);
//           console.log("response SO=>", response);
//           console.log(
//             "response SO lineItems=>",
//             JSON.stringify(response.line_items)
//           );
//           if (res.statusCode >= 200 && res.statusCode < 300) {
//             console.log(`SO created successfully. Response:`, response.message);

//             // const so_stock = Number(soDetails.item_quantity); // SO stock is the quantity billed
//             // await updateItemStock(
//             //   itemId,
//             //   itemInitialStock,
//             //   authToken,
//             //   0,
//             //   so_stock
//             // ); // Passing 0 for PO stock
//             resolve(response);
//           } else {
//             console.error("Error creating SO:", response);
//             sendEmail(`Error creating SO: ${response.message}`)
//             reject(
//               new Error(`API Error: ${res.statusCode} - ${response.message}`)
//             );
//           }
//           await delay(5000);
//         } catch (parseError) {
//           console.error("Error parsing creation response:", parseError);
//           reject(parseError);
//         }
//       });

//       res.on("error", (error) => {
//         console.error("Network error creating SO:", error);
//         reject(error);
//       });
//     });

//     req.write(JSON.stringify(soPayload));
//     req.end();
//   }
// }

async function createOrUpdateSO(
  soDetails,
  existingSOs,
  customers,
  wareHouses,
  authToken,
  resolve,
  reject,
  sendEmail = null,
) {
  console.log('soDetails=>', soDetails);

  const createOptions = {
    method: 'POST',
    hostname: 'www.zohoapis.com',
    path: `/inventory/v1/salesorders?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
    headers: {
      Authorization: `Zoho-oauthtoken ${authToken}`,
      'Content-Type': 'application/json',
    },
  };

  const updateOptions = (soId) => ({
    method: 'PUT',
    hostname: 'www.zohoapis.com',
    path: `/inventory/v1/salesorders/${soId}?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
    headers: {
      Authorization: `Zoho-oauthtoken ${process.env.ZOHO_AUTH_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const existingSO = existingSOs.find(
    (so) => so.salesorder_number === soDetails.salesorder_number,
  );

  let itemId = null;
  let itemInitialStock = null;

  try {
    const fetchedItem =
      (await fetchItemFromZoho(soDetails.sku, authToken, sendEmail)) || {};
    itemId = fetchedItem.itemId || null;
    itemInitialStock = fetchedItem.itemInitialStock || null;

    if (!itemId) console.warn(`No Item ID found for SKU ${soDetails.sku}`);
    if (itemInitialStock === undefined)
      console.warn(`Initial stock not available for SKU ${soDetails.sku}`);
  } catch (error) {
    console.error(
      `Error fetching item details for SKU ${soDetails.sku}:`,
      error.message,
    );
  }

  const soPayload = soDetails;

  const makeRequest = (options, isUpdate = false) => {
    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => (body += chunk));

      res.on('end', async () => {
        try {
          const response = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(
              `SO ${isUpdate ? 'updated' : 'created'} successfully.`,
              response.message,
            );
            resolve(response);
          } else {
            console.error(
              `Error ${isUpdate ? 'updating' : 'creating'} SO:`,
              response,
            );
            if (sendEmail)
              sendEmail(
                `Error ${isUpdate ? 'updating' : 'creating'} SO: ${response.message}`,
              );
            reject(
              new Error(`API Error: ${res.statusCode} - ${response.message}`),
            );
          }
          await delay(5000);
        } catch (parseError) {
          console.error('Error parsing response:', parseError);
          reject(parseError);
        }
      });

      res.on('error', (error) => {
        console.error('Network error:', error);
        reject(error);
      });
    });

    console.log('soPayload=>', soPayload);

    req.write(JSON.stringify(soPayload));
    req.end();
  };

  if (existingSO) {
    console.log(`Updating existing SO: ${soDetails.salesorder_number}`);
    makeRequest(updateOptions(existingSO.salesorder_id), true);
  } else {
    console.log(`Creating new SO: ${soDetails.salesorder_number}`);
    makeRequest(createOptions, false);
  }
}

export const convertQuantityToItemUnit = (quantity, soUnit, itemUnit) => {
  const normalizedSoUnit = soUnit?.toLowerCase().trim();
  const normalizedItemUnit = itemUnit?.toLowerCase().trim();

  const isBottle = (unit) => unit === 'bot' || unit === 'bottle';

  const getCaseSize = (unit) => {
    const match = unit.match(/^c(\d+)$/i); // matches C4, C6, C12, etc.
    return match ? parseInt(match[1], 10) : null;
  };

  const soCaseSize = getCaseSize(normalizedSoUnit);
  const itemCaseSize = getCaseSize(normalizedItemUnit);

  // Case 1: both are bottles → no conversion
  if (isBottle(normalizedSoUnit) && isBottle(normalizedItemUnit)) {
    return quantity;
  }

  // Case 2: soUnit is bottles, itemUnit is case → convert bottles to cases
  if (isBottle(normalizedSoUnit) && itemCaseSize) {
    return parseFloat((quantity / itemCaseSize).toFixed(4));
  }

  // Case 3: soUnit is case, itemUnit is bottle → convert cases to bottles
  if (soCaseSize && isBottle(normalizedItemUnit)) {
    return quantity * soCaseSize;
  }

  // Case 4: both are case units (e.g., C6 and C12) → normalize between cases
  if (soCaseSize && itemCaseSize) {
    return parseFloat(((quantity * soCaseSize) / itemCaseSize).toFixed(4));
  }

  // Default: no conversion
  return quantity;
};

// Group line items for the same sales order
async function groupLineItemsBySO(
  sodata,
  authToken,
  customers,
  wareHouses,
  sendEmail = null,
) {
  const groupedSOs = {};

  for (const so of sodata) {
    try {
      let itemId = null;
      let itemInitialStock = null;
      let itemUnit = null;

      // Fetch item details
      const fetchedItem =
        (await fetchItemFromZoho(so.sku, authToken, sendEmail)) || {};
      // console.log("fetchedItem=>", fetchedItem);
      itemId = fetchedItem.itemId;
      itemInitialStock = fetchedItem.itemInitialStock;
      itemUnit = fetchedItem.itemUnit;

      const fetchedItemData = await fetchItemById(itemId, authToken, sendEmail);
      // console.log("fetchedItemData for itemId", itemId, "=>", fetchedItemData);
      let unitConversions = fetchedItemData?.item?.unit_conversions
        ? fetchedItemData?.item?.unit_conversions
        : fetchedItemData?.unit_conversions;
      let unitConversionId;
      let unitConversionRate = so.item_rate;
      // console.log("SO unitConversions=>", unitConversions);

      // Check if there are any unit conversions
      if (unitConversions && unitConversions.length > 0) {
        // console.log("Unit conversions found for SKU ", so.sku);
        // Process each unit conversion
        unitConversions.forEach((conversion) => {
          // Do something with each conversion, e.g., log it
          if (conversion.target_unit === so.item_unit) {
            unitConversionId = conversion.unit_conversion_id;
            unitConversionRate = conversion.conversion_rate;
          }
        });
      } else {
        console.log('No unit conversions found');
      }

      if (!itemId) {
        throw new Error(`Item ID not found for SKU: ${so.sku}`);
      }

      // Fetch customer ID
      let customerID = '';
      console.log('customers=>', customers);
      customers.forEach((customerData) => {
        if (
          customerData?.contactName === so?.customer_name ||
          customerData?.companyName === so?.customer_name
        ) {
          if (typeof customerData.customerId === 'object') {
            customerID = customerData.customerId?.customerId || '';
          } else {
            customerID = customerData.customerId || '';
          }
        }
      });

      if (!customerID) {
        throw new Error(
          `Customer ID not found for customer: ${so.customer_name}`,
        );
      }

      // Fetch warehouse ID
      const warehouseId = wareHouses.find(
        (whData) => whData.warehouse_name === so.warehouse_name,
      )?.warehouse_id;

      if (!warehouseId) {
        throw new Error(
          `Warehouse ID not found for warehouse: ${so.warehouse_name}`,
        );
      }

      const today = new Date().toISOString().split('T')[0];

      if (!groupedSOs[so.salesorder_number]) {
        groupedSOs[so.salesorder_number] = {
          customer_id: customerID,
          salesorder_number: so.salesorder_number,
          date: so.date,
          shipment_date:
            new Date(so.shipment_date) < new Date() ? today : so.shipment_date,
          notes: so.notes,
          terms: so.terms,
          discount: so.discount,
          is_discount_before_tax: so.is_discount_before_tax,
          shipping_charge: so.shipping_charge,
          delivery_method: so.delivery_method,
          line_items: [],
        };
      }

      // Push line item
      const lineItem = {
        item_id: itemId,
        name: so.item_name,
        // rate: so.item_rate,
        quantity: so.item_quantity,
        unit: so.item_unit,
        item_total: Number(so.item_total),
        warehouse_id: warehouseId,
      };

      // If unitConversionId exists, add it to the line item payload
      if (unitConversionId) {
        lineItem.unit_conversion_id = unitConversionId;
        lineItem.rate = unitConversionRate;
      }

      groupedSOs[so.salesorder_number].line_items.push(lineItem);
    } catch (error) {
      console.error(
        `Error processing SO: ${so.salesorder_number} | ${error.message}`,
      );
      // Optionally continue processing others, or rethrow to stop all
      throw error;
    }
  }

  return Object.values(groupedSOs);
}

async function pushSOToZoho(
  apiUrl,
  authToken,
  sodata,
  customers,
  wareHouses,
  sendEmail,
) {
  console.log('sodata=>', sodata);

  if (!Array.isArray(sodata) || sodata.length === 0) {
    const error = new Error('Invalid or empty SO data provided');
    console.error(error.message);
    if (sendEmail) sendEmail(error.message);
    throw error;
  }

  const groupedSOData = await groupLineItemsBySO(
    sodata,
    authToken,
    customers,
    wareHouses,
    sendEmail,
  );
  console.log('groupedSOData=>', JSON.stringify(groupedSOData, null, 2));

  try {
    const existingSOs = await getAllSalesOrders(authToken);
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const soDetailsPromises = groupedSOData.map((groupedSO, index) =>
      limit(async () => {
        try {
          const result = await new Promise((resolve, reject) =>
            createOrUpdateSO(
              groupedSO,
              existingSOs,
              customers,
              wareHouses,
              authToken,
              resolve,
              reject,
              sendEmail,
            ),
          );
          console.log(`SO ${index + 1} processed successfully.`);
          await delay(5000);
          return result;
        } catch (error) {
          console.error(`Error processing SO ${index + 1}:`, error.message);
          return { error: error.message };
        }
      }),
    );

    const results = await Promise.allSettled(soDetailsPromises);

    const successfulSOs = results
      .filter((r) => r.status === 'fulfilled' && !r.value?.error)
      .map((r) => r.value);

    const failedSOs = results.filter(
      (r) => r.status === 'fulfilled' && r.value?.error,
    );

    if (sendEmail && failedSOs.length > 0) {
      sendEmail(
        `Some Sales Orders failed: ${failedSOs.map((f) => f.value.error).join(', ')}`,
      );
    }

    console.log('All SOs processed. Successful SOs:', successfulSOs);
    return successfulSOs;
  } catch (error) {
    console.error('Error in pushSOToZoho:', error.message);
    throw error;
  }
}

export default pushSOToZoho;
