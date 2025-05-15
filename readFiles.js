import fs from 'fs';
import path from 'path';

// Function to read CSV files from a directory
export function readCSVFiles(directory) {
  try {
    // Read all files in the directory
    const files = fs.readdirSync(directory);

    // Filter for CSV files
    const csvFiles = files.filter(
      (file) => path.extname(file).toLowerCase() === '.csv',
    );

    return csvFiles;
  } catch (error) {
    console.error(
      `Error reading CSV files from directory (${directory}): ${error.message}`,
    );
    return [];
  }
}

// Function to get the creation date of a file
export function createdDate(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.birthtime;
  } catch (error) {
    console.error(
      `Error getting creation date for file (${filePath}): ${error.message}`,
    );
    return null;
  }
}
