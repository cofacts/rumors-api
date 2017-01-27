import GraphQL from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/GetReplyAndArticle';

beforeAll(() => loadFixtures(fixtures));

describe('GetArticle', () => {
  it('should get the specified article & associated replies from ID', async () => {
    expect(await GraphQL(`{
      GetArticle(id: "foo") {
        text
        references { type }
        replies {
          versions {
            text
            type
            reference
          }
        }
      }
    }`)).toMatchSnapshot();
  });
});

describe('GetReply', () => {
  it('should get the specified reply & associated articles from ID', async () => {
    expect(await GraphQL(`{
      GetReply(id: "bar") {
        versions {
          text
          type
          reference
        }
        articles {
          text
        }
      }
    }`)).toMatchSnapshot();
  });
});

afterAll(() => unloadFixtures(fixtures));
