export default {
  '/articles/doc/image1': {
    text: '',
    attachmentUrl: 'http://foo/image.jpeg',
    attachmentHash: 'ffff8000',
    replyRequestCount: 1,
    references: [{ type: 'LINE' }],
  },
  '/airesponses/doc/ocr': {
    docId: 'mock_image_hash',
    type: 'TRANSCRIPT',
    text: 'OCR result of output image',
    status: 'SUCCESS',
    createdAt: '2020-01-01T00:00:00.000Z',
  },
};
