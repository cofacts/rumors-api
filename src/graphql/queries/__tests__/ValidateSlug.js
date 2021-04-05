import fixtures from '../__fixtures__/ValidateSlug';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import gql from 'util/GraphQL';

import { assertSlugIsValid } from '../ValidateSlug';
import { errors } from 'graphql/models/SlugErrorEnum';

describe('assertSlugIsValid', () => {
  beforeAll(() => loadFixtures(fixtures));
  afterAll(() => unloadFixtures(fixtures));

  it('returns for valid slugs', async () => {
    await expect(assertSlugIsValid('valid', 'other-user')).resolves.toEqual(
      undefined
    );
    await expect(assertSlugIsValid('space ok', 'other-user')).resolves.toEqual(
      undefined
    );
    await expect(assertSlugIsValid('正確', 'other-user')).resolves.toEqual(
      undefined
    );
    await expect(assertSlugIsValid('👌', 'other-user')).resolves.toEqual(
      undefined
    );
  });

  it('does not throw error if the slug is taken by the user themselves', async () => {
    await expect(assertSlugIsValid('taken', 'test-user')).resolves.toEqual(
      undefined
    );
  });

  it('throws slug error', async () => {
    await expect(assertSlugIsValid('    ', 'other-user')).rejects.toEqual(
      errors.EMPTY
    );

    await expect(
      assertSlugIsValid('    leading space', 'other-user')
    ).rejects.toEqual(errors.NOT_TRIMMED);
    await expect(
      assertSlugIsValid('trailing space   ', 'other-user')
    ).rejects.toEqual(errors.NOT_TRIMMED);

    await expect(assertSlugIsValid(':3', 'other-user')).rejects.toEqual(
      errors.HAS_URI_COMPONENT
    ); // :
    await expect(assertSlugIsValid('#_#', 'other-user')).rejects.toEqual(
      errors.HAS_URI_COMPONENT
    ); // #
    await expect(assertSlugIsValid('1/2', 'other-user')).rejects.toEqual(
      errors.HAS_URI_COMPONENT
    ); // /

    await expect(assertSlugIsValid('taken', 'other-user')).rejects.toEqual(
      errors.TAKEN
    );
  });
});

describe('ValidateSlug', () => {
  beforeAll(() => loadFixtures(fixtures));
  afterAll(() => unloadFixtures(fixtures));

  it('rejects anonymous user', async () => {
    await expect(
      gql`
        {
          ValidateSlug(slug: "foo") {
            success
            error
          }
        }
      `(
        {},
        {
          appId: 'some-app',
        }
      )
    ).resolves.toMatchInlineSnapshot(`
            Object {
              "data": Object {
                "ValidateSlug": null,
              },
              "errors": Array [
                [GraphQLError: userId is not set via query string.],
              ],
            }
          `);
  });

  it('returns error for invalid slug', async () => {
    await expect(
      gql`
        {
          ValidateSlug(slug: "taken") {
            success
            error
          }
        }
      `(
        {},
        {
          userId: 'other-user',
          appId: 'some-app',
        }
      )
    ).resolves.toMatchInlineSnapshot(`
            Object {
              "data": Object {
                "ValidateSlug": Object {
                  "error": "TAKEN",
                  "success": false,
                },
              },
            }
          `);
  });

  it('returns success for valid slug', async () => {
    await expect(
      gql`
        {
          ValidateSlug(slug: "valid") {
            success
            error
          }
        }
      `(
        {},
        {
          userId: 'other-user',
          appId: 'some-app',
        }
      )
    ).resolves.toMatchInlineSnapshot(`
            Object {
              "data": Object {
                "ValidateSlug": Object {
                  "error": null,
                  "success": true,
                },
              },
            }
          `);
  });
});
