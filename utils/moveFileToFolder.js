const moveFileToFolder = async (file, storage, bucketName, destination) => {
  try {
    await file.copy(storage.bucket(bucketName).file(destination));
    await file.delete();
    console.log(`moveFileToFolder(), File moved to: ${destination}`);
  } catch (moveError) {
    console.error(
      `moveFileToFolder(), Error moving file to ${destination}:`,
      moveError,
    );
  }
};

export default moveFileToFolder;
