import client from 'util/client';
import GraphQL from '../../../../test/util/GraphQL';
import fixtures from '../__fixtures__/GetRumor';

describe('GetRumor', () => {
  let items;
  beforeAll(() => client.bulk({body: fixtures}).then((r) => { items = r.items; }));

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

  afterAll(() => console.log('rRRrrrRR', items));
});
