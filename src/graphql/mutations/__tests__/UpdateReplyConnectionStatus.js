import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/UpdateReplyConnectionStatus';

describe('UpdateReplyConnectionStatus', () => {
  beforeEach(() => {
    MockDate.set(1485593157011);
    return loadFixtures(fixtures);
  });

  it("should not allow users to delete other's replyconnections", async () => {
    const { errors } = await gql`
      mutation {
        UpdateReplyConnectionStatus(
          replyConnectionId: "others"
          status: DELETED
        ) {
          id
        }
      }
    `({}, { userId: 'foo', from: 'test' });

    expect(errors).toMatchSnapshot();
  });

  it('should set replyconnections fields correctly', async () => {
    const { data } = await gql`
      mutation {
        normal: UpdateReplyConnectionStatus( replyConnectionId: "normal", status: DELETED ) { id }
        deleted: UpdateReplyConnectionStatus( replyConnectionId: "deleted", status: DELETED ) { id }
      }
    `({}, { userId: 'foo', from: 'test' });

    expect(data).toMatchSnapshot();

    const { _source: normal } = await client.get({
      index: 'replyconnections',
      type: 'basic',
      id: 'normal',
    });
    expect(normal).toMatchSnapshot();

    const { _source: deleted } = await client.get({
      index: 'replyconnections',
      type: 'basic',
      id: 'deleted',
    });
    expect(deleted).toMatchSnapshot();

    // Cleanup
    await resetFrom(fixtures, '/replyconnections/basic/normal');
    await resetFrom(fixtures, '/replyconnections/basic/deleted');
  });

  afterEach(() => {
    MockDate.reset();
    return unloadFixtures(fixtures);
  });
});
