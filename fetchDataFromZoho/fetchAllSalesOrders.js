import https from 'https';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Function to get all existing sales orders
export async function fetchAllSalesOrders(authToken) {
  try {
    const allSalesOrders = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const paginatedOptions = {
        method: 'GET',
        hostname: 'www.zohoapis.com',
        path: `/inventory/v1/salesorders?organization_id=${process.env.ZOHO_ORGANIZATION_ID}&page=${page}&per_page=200`,
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
                console.log(`Fetched sales orders page ${page} successfully.`);
                resolve(response);
              } else {
                console.error(
                  `Error fetching sales orders page ${page}:`,
                  response,
                );
                reject(
                  new Error(
                    `Failed to fetch sales orders page ${page}: ${response.message}`,
                  ),
                );
              }
            } catch (parseError) {
              reject(
                new Error(
                  `Error parsing fetched sales orders page ${page}: ${parseError.message}`,
                ),
              );
            }
          });

          res.on('error', (error) => {
            reject(
              new Error(
                `Network error fetching sales orders page ${page}: ${error.message}`,
              ),
            );
          });
        });

        req.end();
      });

      // Add the fetched sales orders to our collection
      if (pageResult.salesorders && pageResult.salesorders.length > 0) {
        allSalesOrders.push(...pageResult.salesorders);
      }

      // Check if there are more pages
      hasMore = pageResult.page_context?.has_more_page || false;
      console.log(
        `Fetched sales orders page ${page}, has_more_page: ${hasMore}`,
      );

      // Increment the page number for the next iteration
      page++;

      // Optional: Add a small delay between API calls to avoid rate limiting
      if (hasMore) {
        await delay(500); // 500ms delay between pagination requests
      }
    }

    console.log(`Fetched a total of ${allSalesOrders.length} sales orders.`);
    return allSalesOrders;
  } catch (error) {
    console.error('Error in fetchAllSalesOrders:', error);
    throw error;
  }
}
