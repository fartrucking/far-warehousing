import logError from './logError.js';

const getFilesFromBucket = async (storage, bucketName) => {
  try {
    const [files] = await storage.bucket(bucketName).getFiles();
    const skipPrefixes = ['Documents/', 'processed/', 'not-processed/'];
    return files.filter((file) => {
      const filePath = file.name;
      return !skipPrefixes.some((prefix) => filePath.startsWith(prefix));
    });
  } catch (error) {
    await logError(
      storage,
      bucketName,
      'Fetching Files from GCS',
      bucketName,
      error.message,
    );
    return [];
  }
};

export default getFilesFromBucket;
