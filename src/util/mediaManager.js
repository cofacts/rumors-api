import { MediaManager } from '@cofacts/media-manager';

export const IMAGE_PREVIEW = 'webp600w';
export const IMAGE_THUMBNAIL = 'jpg240h';

export const VIDEO_PREVIEW = '0.75x30s';
export const VIDEO_THUMBNAIL = '240p5s';

const mediaManager = new MediaManager({
  bucketName: process.env.GCS_BUCKET_NAME,
  credentialsJSON: process.env.GCS_CREDENTIALS,
  prefix: process.env.GCS_MEDIA_FOLDER,
});

export default mediaManager;
