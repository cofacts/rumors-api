import { MediaManager } from '@cofacts/media-manager';

export const IMAGE_PREVIEW = 'webp600w';
export const IMAGE_THUMBNAIL = 'jpg240h';

const mediaManager = new MediaManager({
  bucketName: process.env.GCS_BUCKET_NAME,
  credentialsJSON: process.env.GCS_CREDENTIALS,
  prefix: process.env.GCS_MEDIA_FOLDER,
});

export default mediaManager;
