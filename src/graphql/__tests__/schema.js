import { printSchema } from 'graphql';
import schema from '../schema';

describe('GraphQL schema', () => {
  // rumors-site, rumors-line-bot and cofacts.ai are built against this schema.
  // When this snapshot changes in a PR, check that the change is backward
  // compatible for them (no removed or renamed fields, no new required args).
  it('matches the snapshot', () => {
    expect(printSchema(schema)).toMatchSnapshot();
  });
});
