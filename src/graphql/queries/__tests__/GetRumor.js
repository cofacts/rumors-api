import GraphQL from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/GetRumor';

describe('GetRumor', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('should get rumor & associated answers from ID', async () => {
    expect(await GraphQL(`{
      GetRumor(id: "foo") {
        text
        answers {
          versions {
            text
            reference
          }
        }
      }
    }`)).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
