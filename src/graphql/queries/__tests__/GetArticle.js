import GraphQL from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/GetArticle';

describe('GetArticle', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('should get articles & associated replies from ID', async () => {
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

  afterAll(() => unloadFixtures(fixtures));
});
