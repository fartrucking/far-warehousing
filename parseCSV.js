import { parse } from "csv-parse/sync";

function parseCSV(csvContent) {
  try {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
    return records;
  } catch (error) {
    console.error("Error parsing CSV:", error);
    throw error;
  }
}

export default parseCSV;
