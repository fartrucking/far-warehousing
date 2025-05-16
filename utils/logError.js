import { formatInTimeZone } from 'date-fns-tz';
import getCurrentDate from './normalizeUtils.js';

const logError = async (
  storage,
  bucketName,
  operation,
  filePath,
  message,
  retries = 3,
) => {
  const logDir = `Documents/ErrorLogs/${getCurrentDate()}/`;
  const logFile = `${logDir}errorLog.txt`;

  try {
    const now = new Date();
    const istDate = formatInTimeZone(
      now,
      'Asia/Kolkata',
      'dd-MM-yyyy HH:mm:ss',
    );
    const logMessage = `Date and Time (IST): ${istDate}\nOperation: ${operation}\nFile Path: ${filePath}\nError Message: ${message}\n\n`;

    const file = storage.bucket(bucketName).file(logFile);
    const [exists] = await file.exists();

    if (exists) {
      const [content] = await file.download();
      const updatedContent = content.toString() + logMessage;
      await file.save(updatedContent, { resumable: false });
    } else {
      await file.save(logMessage, { resumable: false });
    }

    console.log(`logError(), Error logged successfully to ${logFile}`);
  } catch (error) {
    if (retries > 0) {
      console.warn(
        `logError(), Retrying logError. Retries left: ${retries - 1}`,
      );
      setTimeout(
        () =>
          logError(
            storage,
            bucketName,
            operation,
            filePath,
            message,
            retries - 1,
          ),
        1000,
      );
    } else {
      console.error(
        `logError(), Error logging error message: ${error.message}`,
      );
    }
  }
};

export default logError;
