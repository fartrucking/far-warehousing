const fetch = import("node-fetch");
const fs = import("fs");
const path = import("path");

async function downloadCSV(url, downloadPath) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to download CSV: ${response.statusText}`);
  const data = await response.text();
  fs.writeFileSync(downloadPath, data);
}

module.exports = { downloadCSV };
