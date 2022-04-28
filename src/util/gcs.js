import { Storage } from '@google-cloud/storage';
import { Readable } from 'stream';
import rollbar from '../rollbarInstance';

const storage = new Storage({
  credentials: JSON.parse(process.env.GCS_CREDENTIALS || '{}'),
});
const gcsBucket = storage.bucket(process.env.GCS_BUCKET_NAME || 'default');

/**
 * Generate hash for identifying if two files are similar
 *
 * @param {ReadableStream | Buffer} data
 * @param {string} fileName
 * @param {string} contentType MIME type
 * @returns {string} url
 */
export async function uploadToGCS(data, fileName, contentType) {
  if (!process.env.GCS_BUCKET_NAME) {
    throw new Error('GCS_BUCKET_NAME is not set, cannot upload file.');
  }

  // If data is buffer, wrap it to become a readable stream
  if (!data.pipe) {
    data = Readable.from(data);
  }

  const options = {
    metadata: {
      contentType,
    },
  };

  const file = gcsBucket.file(fileName);
  const url = await new Promise((resolve, reject) => {
    data
      .pipe(file.createWriteStream(options))
      .on('error', function(err) {
        rollbar.error('GCS error', err);
        reject(new Error(`[GCS] faild to upload file`));
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
