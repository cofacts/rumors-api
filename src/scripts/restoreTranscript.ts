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
  const { _source } = await client
    .get<{ ydoc?: string; versions?: YdocVersion[] }>({
      index: 'ydocs',
      id: articleId,
    })
    .catch((e) => {
      if (e?.meta?.statusCode === 404) return { _source: undefined };
      throw e;
    });

  if (!_source?.ydoc)
    throw new Error(`Article ${articleId} has no transcript ydoc`);

  return { ydoc: _source.ydoc, versions: _source.versions ?? [] };
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
 * - Contributors who last edited after that version are removed from `articles.contributors`,
 *   since their edits are reverted.
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
  const { ydoc, versions } = await getYdoc(articleId);
  const targetVersion = versions.find(
    ({ createdAt }) => createdAt === versionCreatedAt
  );
  if (!targetVersion)
    throw new Error(
      `Article ${articleId} has no transcript version created at ${versionCreatedAt}`
    );

  const doc = decodeYdoc(ydoc);
  const versionDoc = Y.createDocFromSnapshot(
    doc,
    Y.decodeSnapshot(Buffer.from(targetVersion.snapshot, 'base64'))
  );

  new Y.PermanentUserData(doc).setUserMapping(
    doc,
    doc.clientID,
    TRANSCRIPT_RESTORER_DESCRIPTION
  );

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

  const text = ydocToPlainText(doc);
  const now = new Date().toISOString();

  await client.update({
    index: 'ydocs',
    id: articleId,
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

  const { _source: article } = await client.get<{
    contributors?: Contributor[];
  }>({ index: 'articles', id: articleId, _source_includes: ['contributors'] });
  const contributors = article?.contributors ?? [];
  const keptContributors = contributors.filter(
    ({ updatedAt }) => updatedAt <= versionCreatedAt
  );
  const removedContributorIds = contributors
    .filter((c) => !keptContributors.includes(c))
    .map(({ userId }) => userId);

  await client.update({
    index: 'articles',
    id: articleId,
    doc: { text, contributors: keptContributors, updatedAt: now },
    refresh: true,
  });

  return { text, removedContributorIds };
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
