import MockDate from 'mockdate';
import * as Y from 'yjs';
import { schema } from 'prosemirror-schema-basic';
import { Node } from 'prosemirror-model';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import restoreTranscript, {
  listVersions,
  ydocToPlainText,
} from '../restoreTranscript';

const ORIGINAL_TEXT = 'First line of transcript\nSecond line';
const SPAM_TEXT = 'Spam ad, contact me at LINE id';

const paragraphs = (text) => ({
  type: 'doc',
  content: text.split('\n').map((line) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: line }],
  })),
});

const encodeSnapshot = (doc) =>
  Buffer.from(Y.encodeSnapshot(Y.snapshot(doc))).toString('base64');

/**
 * Simulates an AI transcript (v1) that is later replaced by spam by another user (v2).
 */
function buildVandalizedYdoc() {
  const doc = prosemirrorJSONToYDoc(schema, paragraphs(ORIGINAL_TEXT));
  doc.gc = false;
  const pud = new Y.PermanentUserData(doc);
  pud.setUserMapping(
    doc,
    doc.clientID,
    JSON.stringify({ id: 'ai-transcript' })
  );
  const v1 = encodeSnapshot(doc);

  // Vandal edits from another client
  const vandalDoc = new Y.Doc({ gc: false });
  Y.applyUpdate(vandalDoc, Y.encodeStateAsUpdate(doc));
  new Y.PermanentUserData(vandalDoc).setUserMapping(
    vandalDoc,
    vandalDoc.clientID,
    JSON.stringify({ id: 'spammer' })
  );
  const fragment = vandalDoc.getXmlFragment('prosemirror');
  const p = new Y.XmlElement('paragraph');
  p.insert(0, [new Y.XmlText(SPAM_TEXT)]);
  vandalDoc.transact(() => {
    fragment.delete(0, fragment.length);
    fragment.insert(0, [p]);
  });
  const v2 = encodeSnapshot(vandalDoc);

  return {
    ydoc: Buffer.from(Y.encodeStateAsUpdate(vandalDoc)).toString('base64'),
    versions: [
      { createdAt: '2026-11-19T00:00:00.000Z', snapshot: v1 },
      { createdAt: '2026-11-22T00:00:00.000Z', snapshot: v2 },
    ],
  };
}

const fixtures = {
  '/articles/doc/vandalized': {
    text: `${SPAM_TEXT}\n`,
    articleType: 'VIDEO',
    contributors: [
      {
        userId: 'early-editor',
        appId: 'WEBSITE',
        updatedAt: '2026-11-18T00:00:00.000Z',
      },
      {
        userId: 'spammer',
        appId: 'WEBSITE',
        updatedAt: '2026-11-22T00:00:00.000Z',
      },
    ],
  },
  '/ydocs/doc/vandalized': buildVandalizedYdoc(),
  '/articles/doc/no-ydoc': { text: 'foo', articleType: 'TEXT' },
};

beforeEach(() => loadFixtures(fixtures));
afterEach(() => unloadFixtures(fixtures));

it('lists versions with their text', async () => {
  expect(await listVersions('vandalized')).toEqual([
    {
      createdAt: '2026-11-19T00:00:00.000Z',
      text: 'First line of transcript\nSecond line\n',
    },
    { createdAt: '2026-11-22T00:00:00.000Z', text: `${SPAM_TEXT}\n` },
  ]);
});

it('rejects unknown article or version', async () => {
  await expect(
    restoreTranscript({ articleId: 'no-ydoc', versionCreatedAt: 'x' })
  ).rejects.toMatchInlineSnapshot(
    `[Error: Article no-ydoc has no transcript ydoc]`
  );
  await expect(
    restoreTranscript({
      articleId: 'vandalized',
      versionCreatedAt: '2000-01-01T00:00:00.000Z',
    })
  ).rejects.toMatchInlineSnapshot(
    `[Error: Article vandalized has no transcript version created at 2000-01-01T00:00:00.000Z]`
  );
});

it('restores transcript to the given version', async () => {
  MockDate.set('2026-11-24T00:00:00.000Z');
  const result = await restoreTranscript({
    articleId: 'vandalized',
    versionCreatedAt: '2026-11-19T00:00:00.000Z',
  });
  MockDate.reset();

  expect(result).toEqual({
    text: 'First line of transcript\nSecond line\n',
    removedContributorIds: ['spammer'],
  });

  const { _source: article } = await client.get({
    index: 'articles',
    id: 'vandalized',
  });
  expect(article.text).toBe('First line of transcript\nSecond line\n');
  expect(article.updatedAt).toBe('2026-11-24T00:00:00.000Z');
  expect(article.contributors.map(({ userId }) => userId)).toEqual([
    'early-editor',
  ]);

  const { _source: ydocEntry } = await client.get({
    index: 'ydocs',
    id: 'vandalized',
  });

  // History is kept and a new version is appended
  expect(ydocEntry.versions.map(({ createdAt }) => createdAt)).toEqual([
    '2026-11-19T00:00:00.000Z',
    '2026-11-22T00:00:00.000Z',
    '2026-11-24T00:00:00.000Z',
  ]);

  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Buffer.from(ydocEntry.ydoc, 'base64'));
  expect(ydocToPlainText(doc)).toBe('First line of transcript\nSecond line\n');

  // Restored doc is still a valid ProseMirror doc, as collab-server's docToPlainText expects
  expect(Node.fromJSON(schema, yDocToProsemirrorJSON(doc)).textContent).toBe(
    'First line of transcriptSecond line'
  );

  // Vandalized version can still be viewed from history
  const vandalizedVersion = Y.createDocFromSnapshot(
    doc,
    Y.decodeSnapshot(Buffer.from(ydocEntry.versions[1].snapshot, 'base64'))
  );
  expect(ydocToPlainText(vandalizedVersion)).toBe(`${SPAM_TEXT}\n`);

  // Restore change is attributed to the restorer
  const pud = new Y.PermanentUserData(doc);
  const users = [...doc.store.clients.keys()].map(
    (clientId) => JSON.parse(pud.getUserByClientId(clientId)).id
  );
  expect(users).toEqual(
    expect.arrayContaining(['ai-transcript', 'spammer', 'transcript-restore'])
  );
});
