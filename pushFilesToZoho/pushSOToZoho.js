import https from 'https';
import fetchItemFromZoho, {
  fetchItemById,
} from '../fetchDataFromZoho/fetchItemsFromZoho.js';
import pLimit from 'p-limit';
import { normalizeString } from '../utils/normalizeUtils.js';
import { fetchAllSalesOrders } from '../fetchDataFromZoho/fetchAllSalesOrders.js';

const limit = pLimit(1);

// Delay function to pause between calls
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  // const updateOptions = (soId) => ({
  //   method: 'PUT',
  //   hostname: 'www.zohoapis.com',
  //   path: `/inventory/v1/salesorders/${soId}?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
  //   headers: {
  //     Authorization: `Zoho-oauthtoken ${process.env.ZOHO_AUTH_TOKEN}`,
  //     'Content-Type': 'application/json',
  //   },
  // });

  const existingSO = existingSOs.find(
    (so) =>
      normalizeString(so.salesorder_number) ===
      normalizeString(soDetails.salesorder_number),
  );

  const soPayload = soDetails;

  const makeRequest = (options) => {
    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => (body += chunk));

      res.on('end', async () => {
        try {
          const response = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`SO created successfully.`, response.message);
            resolve(response);
          } else {
            console.error(`Error creating SO:`, response);
            if (sendEmail) sendEmail(`Error creating SO: ${response.message}`);
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
    const msg = `SO already exists with number: ${soDetails.salesorder_number}`;
    console.log(msg);
    if (sendEmail) sendEmail(msg);
    resolve({
      message: msg,
      salesorder_number: soDetails.salesorder_number,
      status: 'exists',
    });
  } else {
    console.log(`Creating new SO: ${soDetails.salesorder_number}`);
    makeRequest(createOptions);
  }
}

// Group line items for the same sales order
async function groupLineItemsBySO(
  sodata,
  authToken,
  customers,
  existingCustomers = null,
  wareHouses,
  sendEmail = null,
) {
  const groupedSOs = {};
  const soErrors = [];

  for (const so of sodata) {
    try {
      let itemId = null;
      let itemName = null;

      // Fetch item details
      const fetchedItem =
        (await fetchItemFromZoho(so.sku, authToken, sendEmail)) || {};
      console.log('fetchedItem=>', fetchedItem);
      itemId = fetchedItem.itemId;
      itemName = fetchedItem.name;

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
        unitConversions.forEach((conversion) => {
          if (conversion.target_unit === so.item_unit) {
            unitConversionId = conversion.unit_conversion_id;
            unitConversionRate = conversion.conversion_rate;
          }
        });
      } else {
        console.log('No unit conversions found');
      }

      if (!itemId) {
        throw new Error(
          `Item ID not found for SKU: ${so.sku}, check if item exists in Zoho.`,
        );
      }

      // Fetch customer ID
      let customerID = '';

      const normalizedCustomerName = normalizeString(so?.customer_name);
      customers.forEach((customerData) => {
        const normalizedContactName = normalizeString(
          customerData?.contactName,
        );
        const normalizedCompanyName = normalizeString(
          customerData?.companyName,
        );

        if (
          normalizedContactName === normalizedCustomerName ||
          normalizedCompanyName === normalizedCustomerName
        ) {
          if (typeof customerData.customerId === 'object') {
            customerID = customerData.customerId?.customerId || '';
          } else {
            customerID = customerData.customerId || '';
          }
        }
      });

      if (!customerID && Array.isArray(existingCustomers)) {
        const existingCustomer = existingCustomers.find((customerData) => {
          const normalizedContactName = normalizeString(
            customerData?.contact_name,
          );
          const normalizedCompanyName = normalizeString(
            customerData?.company_name,
          );
          return (
            normalizedContactName === normalizedCustomerName ||
            normalizedCompanyName === normalizedCustomerName
          );
        });
        if (existingCustomer) {
          customerID = existingCustomer.contact_id || '';
        }
      }

      if (!customerID) {
        throw new Error(
          `Customer ID not found for customer: ${so.customer_name}`,
        );
      }

      // Fetch warehouse ID using normalized name match
      const warehouseId =
        wareHouses.find(
          (whData) =>
            normalizeString(whData.warehouse_name) ===
            normalizeString(so.warehouse_name),
        )?.warehouse_id || '';

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
          // date: so.date,
          date:
            new Date(so.date) > new Date(so.shipment_date)
              ? new Date(new Date(so.shipment_date).getTime() - 86400000)
                  .toISOString()
                  .split('T')[0]
              : new Date(so.date).toISOString().split('T')[0],
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
        name: itemName ? itemName : so.item_name,
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
      soErrors.push({
        salesorder_number: so.salesorder_number,
        error: error.message,
      });
      // Do NOT throw; just continue to next SO
      continue;
    }
  }

  return { groupedSOs: Object.values(groupedSOs), soErrors };
}

async function pushSOToZoho(
  apiUrl,
  authToken,
  sodata,
  customers,
  existingCustomers = null,
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

  // Get grouped SOs and errors
  const { groupedSOs, soErrors } = await groupLineItemsBySO(
    sodata,
    authToken,
    customers,
    existingCustomers,
    wareHouses,
    sendEmail,
  );
  console.log('groupedSOData=>', JSON.stringify(groupedSOs, null, 2));

  try {
    const existingSOs = await fetchAllSalesOrders(authToken);
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const soDetailsPromises = groupedSOs.map((groupedSO, index) =>
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
          return {
            error: error.message,
            salesorder_number: groupedSO.salesorder_number,
          };
        }
      }),
    );

    const results = await Promise.allSettled(soDetailsPromises);

    const successfulSOs = results
      .filter((r) => r.status === 'fulfilled' && !r.value?.error)
      .map((r) => r.value);

    // Collect failed SOs from both grouping and processing
    const failedSOs = [
      ...soErrors,
      ...results
        .filter((r) => r.status === 'fulfilled' && r.value?.error)
        .map((r) => ({
          salesorder_number: r.value.salesorder_number,
          error: r.value.error,
        })),
    ];

    if (sendEmail && failedSOs.length > 0) {
      sendEmail(
        `Some Sales Orders failed:\n${failedSOs
          .map((f) => `SO ${f.salesorder_number}: ${f.error}`)
          .join('\n')}`,
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
