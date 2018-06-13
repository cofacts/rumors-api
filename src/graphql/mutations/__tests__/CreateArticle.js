import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures, { fixture1Text } from '../__fixtures__/CreateArticle';
import { getReplyRequestId } from '../CreateReplyRequest';
import { getArticleId } from 'graphql/mutations/CreateArticle';

it('creates articles and a reply request', async () => {
  MockDate.set(1485593157011);
  const userId = 'test';
  const appId = 'foo';

  const { data, errors } = await gql`
    mutation($text: String!, $reference: ArticleReferenceInput!) {
      CreateArticle(
        text: $text
        reference: $reference
        reason: "気になります"
      ) {
        id
      }
    }
  `(
    {
      text: 'FOO FOO',
      reference: { type: 'LINE' },
    },
    { userId, appId }
  );
  MockDate.reset();

  expect(errors).toBeUndefined();

  const { _source: article } = await client.get({
    index: 'articles',
    type: 'doc',
    id: data.CreateArticle.id,
  });

  expect(article.replyRequestCount).toBe(1);
  expect(article).toMatchSnapshot();

  const replyRequestId = getReplyRequestId({
    articleId: data.CreateArticle.id,
    userId,
    appId,
  });

  const { _source: replyRequest } = await client.get({
    index: 'replyrequests',
    type: 'doc',
    id: replyRequestId,
  });

  expect(replyRequest).toMatchSnapshot();

  // Cleanup
  await client.delete({
    index: 'articles',
    type: 'doc',
    id: data.CreateArticle.id,
  });

  await client.delete({
    index: 'replyrequests',
    type: 'doc',
    id: replyRequestId,
  });
});

it('avoids creating duplicated articles and adds replyRequests automatically', async () => {
  await loadFixtures(fixtures);

  MockDate.set(1485593157011);
  const userId = 'test';
  const appId = 'foo';
  const articleId = getArticleId(fixture1Text);

  const { data, errors } = await gql`
    mutation($text: String!, $reference: ArticleReferenceInput!) {
      CreateArticle(
        text: $text
        reference: $reference
        reason: "気になります"
      ) {
        id
      }
    }
  `(
    {
      text: fixture1Text,
      reference: { type: 'LINE' },
    },
    { userId, appId }
  );
  MockDate.reset();
  expect(errors).toBeUndefined();

  // Expects no new article is created,
  // and it returns the existing ID
  expect(data.CreateArticle.id).toBe(articleId);

  const { _source: article } = await client.get({
    index: 'articles',
    type: 'doc',
    id: articleId,
  });

  // Expects lastRequestedAt, references are updated
  expect(article).toMatchSnapshot();

  // Expects new replyRequest is generated
  const replyRequestId = getReplyRequestId({ articleId, appId, userId });
  const { _source: replyRequest } = await client.get({
    index: 'replyrequests',
    type: 'doc',
    id: replyRequestId,
  });

  expect(replyRequest).toMatchSnapshot();

  // Cleanup
  await client.delete({
    index: 'replyrequests',
    type: 'doc',
    id: replyRequestId,
  });

  await unloadFixtures(fixtures);
});
