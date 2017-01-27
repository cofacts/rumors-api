import GraphQL from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/Search';

describe('Search', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('fetches related articles and replies', async () => {
    expect(await GraphQL(`{
      Search(
        text: "憶昔封書與君夜，金鑾殿後欲明天。今夜封書在何處？廬山庵裏曉燈前。籠鳥檻猿俱未死，人間相見是何年？微之，微之！此夕此心，君知之乎！"
        findInCrawled: false
      ) {
        articles {
          doc { text }
        }
        replies {
          doc { versions { text } }
        }
      }
    }`)).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
