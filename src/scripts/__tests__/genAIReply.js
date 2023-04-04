jest.mock('graphql/mutations/CreateAIReply');

import client from 'util/client';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import { createNewAIReply } from 'graphql/mutations/CreateAIReply';
import fixtures from '../__fixtures__/genAIReply';
import genAIReply, { GENERATOR_USER_ID } from '../genAIReply';

beforeEach(() => loadFixtures(fixtures));

it('rejects when articleId is not provided', async () => {
  await expect(
    genAIReply({ articleId: undefined })
  ).rejects.toThrowErrorMatchingInlineSnapshot(`"Please specify articleId"`);
});

it('calls AI reply generation as expected', async () => {
  createNewAIReply.mockImplementationOnce(async () => undefined);

  await genAIReply({ articleId: 'some-article' });

  expect(createNewAIReply).toHaveBeenCalledTimes(1);
  expect(createNewAIReply.mock.calls[0][0].article).toMatchInlineSnapshot(`
    Object {
      "id": "some-article",
      "text": "Some article",
    }
  `);
  expect(createNewAIReply.mock.calls[0][0].user.appUserId).toBe(
    GENERATOR_USER_ID
  );

  // Cleanup generated reviewer user before invoking the mocked createNewAIReply
  await client.delete({
    index: 'users',
    type: 'doc',
    id: createNewAIReply.mock.calls[0][0].user.id,
  });
});

afterEach(() => unloadFixtures(fixtures));
