import 'dotenv/config';
import client from 'util/client';

/**
 * Updates users index mapping to include badges field
 */
async function addBadgesField() {
  await client.indices.putMapping({
    index: 'users',
    body: {
      properties: {
        badges: {
          type: 'nested',
          properties: {
            badgeId: { type: 'keyword' },
            badgeMetaData: { type: 'keyword' },
            isDisplayed: { type: 'boolean' },
            createdAt: { type: 'date' },
            updatedAt: { type: 'date' },
          },
        },
      },
    },
  });
}

if (require.main === module) {
  addBadgesField().then(
    () => {
      console.log('✅ Users index mapping updated successfully');
      process.exit(0);
    },
    error => {
      console.error('❌ Error updating users index mapping:', error);
      process.exit(1);
    }
  );
}

export default addBadgesField;
