import sharp from 'sharp';
import { MediaManager, variants } from '@cofacts/media-manager';

const mediaManager = new MediaManager({
  bucketName: process.env.GCS_BUCKET_NAME,
  credentialsJSON: process.env.GCS_CREDENTIALS,
  prefix: process.env.GCS_MEDIA_FOLDER,
  getVariantSettings(options) {
    const { type, contentType } = options;
    switch (type) {
      case 'image':
        return [
          variants.original(contentType),
          {
            name: 'jpg240h',
            contentType: 'image/jpeg',
            transform: sharp()
              .resize({ height: 240, withoutEnlargement: true })
              .jpeg({ quality: 60 }),
          },
          {
            name: 'webp600w',
            contentType: 'image/webp',
            transform: sharp()
              .resize({ width: 600, withoutEnlargement: true })
              .webp({ quality: 60 }),
          },
        ];
      default:
        return variants.defaultGetVariantSettings(options);
    }
  },
});

export default mediaManager;
