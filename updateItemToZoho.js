import https from "https";
// Function to add a delay
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Update existing item in Zoho
async function updateItemToZoho(item_id, authToken, payload) {
  return new Promise(async (resolve, reject) => {
    const options = {
      method: "PUT",
      hostname: "www.zohoapis.com",
      path: `/inventory/v1/items/${item_id}?organization_id=${process.env.ZOHO_ORGANIZATION_ID}`,
      headers: {
        Authorization: `Zoho-oauthtoken ${authToken}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let body = "";

      res.on("data", (chunk) => {
        body += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(body);
          if (response.code === 0) {
            resolve(response);
          } else {
            reject(new Error(`Failed to update item: ${response.message}`));
          }
        } catch (error) {
          reject(new Error(`Error parsing response: ${error.message}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Request error: ${error.message}`));
    });
    const updatedPayload = {
      item_type: payload?.item_type,
      product_type: payload?.product_type,
      unit: payload?.unit,
      initial_stock: Number(payload?.initial_stock),
      initial_stock_rate:
        payload?.initial_stock_rate > 0
          ? Number(payload?.initial_stock_rate)
          : 0.01,
      warehouse_name: payload?.warehouse_name,
    };
    // console.log('updated item payload=>', updatedPayload)

    // Pause before sending the request to ensure rate limit isn't exceeded
    await delay(5000); // Delay of 2 seconds

    req.write(JSON.stringify(updatedPayload));
    req.end();
  });
}

export default updateItemToZoho;
