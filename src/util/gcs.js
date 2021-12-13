import { Storage } from '@google-cloud/storage';

const storage = new Storage({
  credentials: JSON.parse(process.env.GCS_CREDENTIALS || '{}'),
});
const gcsBucket = storage.bucket(process.env.GCS_BUCKET_NAME || 'default');

/**
 * Generate hash for identifying if two files are similar
 *
 * @param {ReadableStream} fileStream
 * @param {string} fileName
 * @param {string} contentType MIME type
 * @returns {string} url
 */
export async function uploadToGCS(fileStream, fileName, contentType) {
  if (!process.env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not set, cannot upload file.');
  }

  const options = {
    metadata: {
      contentType,
    },
  };

  const file = gcsBucket.file(fileName);
  const url = await new Promise((resolve, reject) => {
    fileStream
      .pipe(file.createWriteStream(options))
      .on('error', function(err) {
        reject(new Error(`[GCS] ${err}`));
      })
      .on('finish', function() {
        // The file upload is complete.
        resolve(
          `https://storage.googleapis.com/${
            process.env.GCS_BUCKET_NAME
          }/${fileName}`
        );
      });
  });

  return url;
}
