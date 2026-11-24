/**
 * Restore an article's transcript to one of its saved versions (`ydocs.versions`).
 *
 * Used when a transcript is vandalized (e.g. replaced by spam via the collaborative editor).
 * The restore is applied as a new Yjs change on top of the existing document, so the edit history
 * (including the vandalism) is kept and the history UI on rumors-site keeps working.
 *
 * Caveat: collab-server keeps a document in memory while anyone has its editor open, and it will
 * write its in-memory copy back over this restore. Run this when nobody is editing the transcript.
 *
 * Usage:
 *   # List versions of an article
 *   npx babel-node --extensions .ts,.js src/scripts/restoreTranscript.ts -a <articleId>
 *
 *   # Restore to the version created at the given time
 *   npx babel-node --extensions .ts,.js src/scripts/restoreTranscript.ts -a <articleId> -v <createdAt>
 */
import 'dotenv/config';
import yargs from 'yargs';
import * as Y from 'yjs';
import client from 'util/client';

type YdocVersion = { createdAt: string; snapshot: string };
type Contributor = { userId: string; appId: string; updatedAt: string };

/**
 * The "user" doing the restore. Recorded in the Yjs permanent user data in the same way as
 * AI_TRANSCRIBER_DESCRIPTION in CreateMediaArticle.
 */
export const TRANSCRIPT_RESTORER_DESCRIPTION = JSON.stringify({
  id: 'transcript-restore',
  appId: 'RUMORS_ADM',
  name: 'Transcript restore',
});

function decodeYdoc(base64: string) {
  const doc = new Y.Doc({ gc: false });
  Y.applyUpdate(doc, Buffer.from(base64, 'base64'));
  return doc;
}

function textContent(node: Y.XmlElement | Y.XmlText | Y.XmlHook): string {
  if (node instanceof Y.XmlText) {
    return node
      .toDelta()
      .map(({ insert }: { insert: unknown }) =>
        typeof insert === 'string' ? insert : ''
      )
      .join('');
  }
  if (node instanceof Y.XmlElement) {
    return node.toArray().map(textContent).join('');
  }
  return '';
}

/**
 * Same plain text format as collab-server's `docToPlainText`:
 * each top-level node's text content followed by a newline.
 */
export function ydocToPlainText(doc: Y.Doc) {
  return doc
    .getXmlFragment('prosemirror')
    .toArray()
    .map((node) => textContent(node) + '\n')
    .join('');
}

async function getYdoc(articleId: string) {
  const result = await client
    .get<{ ydoc?: string; versions?: YdocVersion[] }>({
      index: 'ydocs',
      id: articleId,
    })
    .catch((e) => {
      if (e?.meta?.statusCode === 404) return undefined;
      throw e;
    });

  if (!result?._source?.ydoc)
    throw new Error(`Article ${articleId} has no transcript ydoc`);

  return {
    ydoc: result._source.ydoc,
    versions: result._source.versions ?? [],
    // For optimistic concurrency control against collab-server's writes
    seqNo: result._seq_no,
    primaryTerm: result._primary_term,
  };
}

/**
 * List saved versions of the transcript of the given article.
 */
export async function listVersions(articleId: string) {
  const { ydoc, versions } = await getYdoc(articleId);
  const doc = decodeYdoc(ydoc);

  return versions.map(({ createdAt, snapshot }) => ({
    createdAt,
    text: ydocToPlainText(
      Y.createDocFromSnapshot(
        doc,
        Y.decodeSnapshot(Buffer.from(snapshot, 'base64'))
      )
    ),
  }));
}

/**
 * Restore the transcript of the article to the version created at `versionCreatedAt`.
 *
 * - Article text is set to the restored version.
 * - Contributors who did not edit before that version and last edited after it are removed from
 *   `articles.contributors`, since their edits are reverted.
 * - Fails without writing anything if collab-server stores the doc at the same time.
 * - A new version snapshot is pushed, so that collab-server's next contributor diff starts from
 *   the restored state.
 */
async function restoreTranscript({
  articleId,
  versionCreatedAt,
}: {
  articleId: string;
  versionCreatedAt: string;
}) {
  const { ydoc, versions, seqNo, primaryTerm } = await getYdoc(articleId);
  const targetVersion = versions.find(
    ({ createdAt }) => createdAt === versionCreatedAt
  );
  if (!targetVersion)
    throw new Error(
      `Article ${articleId} has no transcript version created at ${versionCreatedAt}`
    );

  // Read the article first, so that a missing article fails before anything is written
  const { _source: article } = await client.get<{
    contributors?: Contributor[];
  }>({ index: 'articles', id: articleId, _source_includes: ['contributors'] });

  const doc = decodeYdoc(ydoc);
  const targetSnapshot = Y.decodeSnapshot(
    Buffer.from(targetVersion.snapshot, 'base64')
  );
  const versionDoc = Y.createDocFromSnapshot(doc, targetSnapshot);
  if (!ydocToPlainText(versionDoc).trim())
    throw new Error(
      `Transcript version ${versionCreatedAt} of article ${articleId} is empty`
    );

  const pud = new Y.PermanentUserData(doc);

  // Users who had edited the doc by the target version, so their text is (partly) restored.
  const usersBeforeVersion = new Set<string>();
  for (const clientId of targetSnapshot.sv.keys()) {
    const user = pud.getUserByClientId(clientId);
    if (user) usersBeforeVersion.add(JSON.parse(user).id);
  }

  pud.setUserMapping(doc, doc.clientID, TRANSCRIPT_RESTORER_DESCRIPTION);

  const fragment = doc.getXmlFragment('prosemirror');
  const restoredNodes = versionDoc
    .getXmlFragment('prosemirror')
    .toArray()
    // ProseMirror documents contain only XmlElement & XmlText
    .filter(
      (node): node is Y.XmlElement | Y.XmlText => !(node instanceof Y.XmlHook)
    )
    .map((node) => node.clone());

  doc.transact(() => {
    fragment.delete(0, fragment.length);
    fragment.insert(0, restoredNodes);
  });

  // PermanentUserData records the deletions of a transaction in a setTimeout callback (yjs 13.6.x,
  // src/utils/PermanentUserData.js); wait for it so that the deleted spam is attributed to the
  // restorer. The test on deletion attribution catches it if a yjs upgrade changes this.
  await new Promise((resolve) => setTimeout(resolve, 0));

  const text = ydocToPlainText(doc);
  const now = new Date().toISOString();

  await client.update({
    index: 'ydocs',
    id: articleId,
    if_seq_no: seqNo,
    if_primary_term: primaryTerm,
    doc: {
      ydoc: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
      versions: [
        ...versions,
        {
          createdAt: now,
          snapshot: Buffer.from(Y.encodeSnapshot(Y.snapshot(doc))).toString(
            'base64'
          ),
        },
      ],
    },
    refresh: true,
  });

  const removedContributors = (article?.contributors ?? []).filter(
    // collab-server writes contributors' updatedAt before the version's createdAt on the same
    // disconnect, both with toISOString(), so string comparison works.
    ({ userId, updatedAt }) =>
      !usersBeforeVersion.has(userId) && updatedAt > versionCreatedAt
  );

  try {
    await client.update({
      index: 'articles',
      id: articleId,
      script: {
        // Remove only the contributor entries read above, so that entries collab-server writes
        // in the meantime are kept.
        source: `
          if (ctx._source.contributors != null) {
            ctx._source.contributors.removeIf(c ->
              params.removed.containsKey(c.userId) && params.removed[c.userId] == c.updatedAt
            );
          }
          ctx._source.text = params.text;
          ctx._source.updatedAt = params.now;
        `,
        lang: 'painless',
        params: {
          removed: Object.fromEntries(
            removedContributors.map(({ userId, updatedAt }) => [
              userId,
              updatedAt,
            ])
          ),
          text,
          now,
        },
      },
      retry_on_conflict: 3,
      refresh: true,
    });
  } catch (e) {
    throw new Error(
      `Transcript ydoc of article ${articleId} is restored, but updating the article failed. ` +
        `Re-running the restore is safe (it adds one more restore version): ${
          e instanceof Error ? e.message : e
        }`
    );
  }

  return {
    text,
    removedContributorIds: removedContributors.map(({ userId }) => userId),
  };
}

export default restoreTranscript;

/* istanbul ignore if */
if (require.main === module) {
  const argv = yargs
    .options({
      articleId: {
        alias: 'a',
        description: 'The article ID',
        type: 'string',
        demandOption: true,
      },
      versionCreatedAt: {
        alias: 'v',
        description:
          '`createdAt` of the version to restore to. Omit to list versions.',
        type: 'string',
      },
    })
    .help('help')
    .parseSync();

  (argv.versionCreatedAt
    ? restoreTranscript({
        articleId: argv.articleId,
        versionCreatedAt: argv.versionCreatedAt,
      })
    : listVersions(argv.articleId)
  )
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
