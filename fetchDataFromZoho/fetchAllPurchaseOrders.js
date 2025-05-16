import https from 'https';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchAllPurchaseOrders(authToken) {
  try {
    const allPurchaseOrders = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const paginatedOptions = {
        method: 'GET',
        hostname: 'www.zohoapis.com',
        path: `/inventory/v1/purchaseorders?organization_id=${process.env.ZOHO_ORGANIZATION_ID}&page=${page}&per_page=200`,
        headers: {
          Authorization: `Zoho-oauthtoken ${authToken}`,
        },
      };

      const pageResult = await new Promise((resolve, reject) => {
        const req = https.request(paginatedOptions, (res) => {
          let body = '';

          res.on('data', (chunk) => {
            body += chunk;
          });

          res.on('end', () => {
            try {
              const response = JSON.parse(body);
              if (res.statusCode >= 200 && res.statusCode < 300) {
                console.log(`Fetched POs page ${page} successfully.`);
                resolve(response);
              } else {
                console.error(`Error fetching POs page ${page}:`, response);
                reject(
                  new Error(
                    `Failed to fetch purchase orders page ${page}: ${response.message}`,
                  ),
                );
              }
            } catch (parseError) {
              reject(
                new Error(
                  `Error parsing fetched POs page ${page}: ${parseError.message}`,
                ),
              );
            }
          });

          res.on('error', (error) => {
            reject(
              new Error(
                `Network error fetching POs page ${page}: ${error.message}`,
              ),
            );
          });
        });

        req.end();
      });

      // Add the fetched purchase orders to our collection
      if (pageResult.purchaseorders && pageResult.purchaseorders.length > 0) {
        allPurchaseOrders.push(...pageResult.purchaseorders);
      }

      // Check if there are more pages
      hasMore = pageResult.page_context?.has_more_page || false;
      console.log(
        `Fetched purchase orders page ${page}, has_more_page: ${hasMore}`,
      );

      // Increment the page number for the next iteration
      page++;

      // Optional: Add a small delay between API calls to avoid rate limiting
      if (hasMore) {
        await delay(500); // 500ms delay between pagination requests
      }
    }

    console.log(
      `Fetched a total of ${allPurchaseOrders.length} purchase orders.`,
    );
    return allPurchaseOrders;
  } catch (error) {
    console.error('Error in getAllPurchaseOrders:', error);
    throw error;
  }
}
