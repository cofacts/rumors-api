import MockDate from 'mockdate';
import * as Y from 'yjs';
import { schema } from 'prosemirror-schema-basic';
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from 'y-prosemirror';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import restoreTranscript, {
  listVersions,
  ydocToPlainText,
} from '../restoreTranscript';

const ORIGINAL_TEXT = 'First line of transcript\nSecond line';
const EDITOR_TEXT = 'Third line by editor';
const RESTORED_TEXT = `${ORIGINAL_TEXT}\n${EDITOR_TEXT}\n`;
const SPAM_TEXT = 'Spam ad, contact me at LINE id';

const paragraphs = (text) => ({
  type: 'doc',
  content: text.split('\n').map((line) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: line }],
  })),
});

const toBase64 = (u8) => Buffer.from(u8).toString('base64');
const encodeSnapshot = (doc) =>
  Buffer.from(Y.encodeSnapshot(Y.snapshot(doc))).toString('base64');

/** Applies an edit from a new client mapped to the given user, like collab-server clients do. */
function editAs(doc, userId, fn) {
  const clientDoc = new Y.Doc({ gc: false });
  Y.applyUpdate(clientDoc, Y.encodeStateAsUpdate(doc));
  new Y.PermanentUserData(clientDoc).setUserMapping(
    clientDoc,
    clientDoc.clientID,
    JSON.stringify({ id: userId })
  );
  clientDoc.transact(() => fn(clientDoc.getXmlFragment('prosemirror')));
  return clientDoc;
}

const paragraph = (text) => {
  const p = new Y.XmlElement('paragraph');
  p.insert(0, [new Y.XmlText(text)]);
  return p;
};

/**
 * Simulates an AI transcript plus an editor's line (v1), later replaced by spam by another user (v2).
 */
function buildVandalizedYdoc() {
  const aiDoc = prosemirrorJSONToYDoc(schema, paragraphs(ORIGINAL_TEXT));
  aiDoc.gc = false;
  new Y.PermanentUserData(aiDoc).setUserMapping(
    aiDoc,
    aiDoc.clientID,
    JSON.stringify({ id: 'ai-transcript' })
  );
  const doc = editAs(aiDoc, 'editor', (fragment) =>
    fragment.insert(fragment.length, [paragraph(EDITOR_TEXT)])
  );
  const v1 = encodeSnapshot(doc);
  const vandalDoc = editAs(doc, 'spammer', (fragment) => {
    fragment.delete(0, fragment.length);
    fragment.insert(0, [paragraph(SPAM_TEXT)]);
  });
  const v2 = encodeSnapshot(vandalDoc);

  return {
    ydoc: toBase64(Y.encodeStateAsUpdate(vandalDoc)),
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
        // Wrote part of v1, and edited again after v1
        userId: 'editor',
        appId: 'WEBSITE',
        updatedAt: '2026-11-20T00:00:00.000Z',
      },
      {
        userId: 'spammer',
        appId: 'WEBSITE',
        updatedAt: '2026-11-22T00:00:00.000Z',
      },
    ],
  },
  '/ydocs/doc/vandalized': buildVandalizedYdoc(),
  '/articles/doc/empty-version': { text: 'foo', articleType: 'VIDEO' },
  '/ydocs/doc/empty-version': {
    ...buildVandalizedYdoc(),
    versions: [
      {
        createdAt: '2026-11-01T00:00:00.000Z',
        snapshot: toBase64(Y.encodeSnapshot(Y.emptySnapshot)),
      },
    ],
  },
  '/articles/doc/no-ydoc': { text: 'foo', articleType: 'TEXT' },
};

beforeEach(() => loadFixtures(fixtures));
afterEach(() => {
  MockDate.reset();
  return unloadFixtures(fixtures);
});

it('lists versions with their text', async () => {
  expect(await listVersions('vandalized')).toEqual([
    { createdAt: '2026-11-19T00:00:00.000Z', text: RESTORED_TEXT },
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
  await expect(
    restoreTranscript({
      articleId: 'empty-version',
      versionCreatedAt: '2026-11-01T00:00:00.000Z',
    })
  ).rejects.toMatchInlineSnapshot(
    `[Error: Transcript version 2026-11-01T00:00:00.000Z of article empty-version is empty]`
  );

  // Nothing is written on failure
  const { _source: ydocEntry } = await client.get({
    index: 'ydocs',
    id: 'empty-version',
  });
  expect(ydocEntry.versions).toHaveLength(1);
});

it('restores transcript to the given version', async () => {
  MockDate.set('2026-11-24T00:00:00.000Z');
  const result = await restoreTranscript({
    articleId: 'vandalized',
    versionCreatedAt: '2026-11-19T00:00:00.000Z',
  });

  expect(result).toEqual({
    text: RESTORED_TEXT,
    removedContributorIds: ['spammer'],
  });

  const { _source: article } = await client.get({
    index: 'articles',
    id: 'vandalized',
  });
  expect(article.text).toBe(RESTORED_TEXT);
  expect(article.updatedAt).toBe('2026-11-24T00:00:00.000Z');
  expect(article.contributors.map(({ userId }) => userId)).toEqual([
    'early-editor',
    'editor',
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
  expect(ydocToPlainText(doc)).toBe(RESTORED_TEXT);

  // Restored doc is still a valid ProseMirror doc, as collab-server's docToPlainText expects
  expect(schema.nodeFromJSON(yDocToProsemirrorJSON(doc)).textContent).toBe(
    RESTORED_TEXT.replace(/\n/g, '')
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
    expect.arrayContaining([
      'ai-transcript',
      'editor',
      'spammer',
      'transcript-restore',
    ])
  );

  // Removal of the spam is attributed to the restorer
  const deletedSpamItems = [...doc.store.clients.values()]
    .flat()
    .filter(
      (struct) =>
        struct instanceof Y.Item &&
        struct.deleted &&
        struct.content instanceof Y.ContentString &&
        struct.content.str.includes('Spam')
    );
  expect(deletedSpamItems).not.toHaveLength(0);
  deletedSpamItems.forEach((item) =>
    expect(JSON.parse(pud.getUserByDeletedId(item.id)).id).toBe(
      'transcript-restore'
    )
  );
});
