// https://storage.googleapis.com/cofacts-media-collection/images/1*TdrXGc6_XNVBvXzElVHVMg.jpeg
import { uploadToGCS } from '../gcs';
import { EventEmitter } from 'events';

jest.mock('@google-cloud/storage', () => {
  const mockGCS = {
    Storage: jest.fn().mockImplementation(() => ({
      bucket: () => ({
        file: () => ({
          createWriteStream: jest.fn(),
        }),
      }),
    })),
  };
  return mockGCS;
});

describe('uploadToGCS', () => {
  const OLD_ENV = process.env;

  beforeAll(() => {
    process.env = { ...OLD_ENV }; // Make a copy
    process.env.GCS_CREDENTIALS = 'mock_credentials';
    process.env.GCS_BUCKET_NAME = 'mock_bucket';
  });
  afterAll(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  const eventEmitter = new EventEmitter();

  const mockReadStream = {
    pipe: jest.fn().mockImplementation(() => {
      return eventEmitter;
    }),
  };

  it('should return url', async () => {
    const fileName = `${'mockFolder'}/${'mockFileNmae.jpeg'}`;
    const mimeType = 'image/jpeg';

    setTimeout(() => {
      eventEmitter.emit('finish');
    }, 50);

    const url = await uploadToGCS(mockReadStream, fileName, mimeType);

    expect(url).toMatchInlineSnapshot(
      `"https://storage.googleapis.com/mock_bucket/mockFolder/mockFileNmae.jpeg"`
    );
  });

  it('should handle gcs error', async () => {
    setTimeout(() => {
      eventEmitter.emit('error', 'Mock error');
    }, 50);

    await expect(
      uploadToGCS(mockReadStream, 'fileName', 'mimeType')
    ).rejects.toMatchInlineSnapshot(`[Error: [GCS] Mock error]`);
  });

  it('should throw env error', async () => {
    delete process.env.GCS_BUCKET_NAME;
    await expect(
      uploadToGCS(mockReadStream, '', '')
    ).rejects.toMatchInlineSnapshot(
      `[Error: GCS_BUCKET_NAME is not set, cannot upload file.]`
    );
  });
});
