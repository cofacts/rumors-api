import 'dotenv/config';

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRouter, Response } from 'fets';
import { Type } from '@sinclair/typebox';

import { useAuditLog, useAuth } from './util';

import pingHandler from './handlers/ping';
import blockUser from './handlers/moderation/blockUser';
import awardBadge from './handlers/badge/awardBadge';
import replaceMediaHandler from './handlers/moderation/replaceMedia';

const shouldAuth = process.env.NODE_ENV === 'production';

const [titleLine, ...readmeLines] = readFileSync(
  path.resolve(__dirname, 'README.md'),
  'utf-8'
).split('\n');

const router = createRouter({
  openAPI: {
    info: {
      title: titleLine.replace(/^#+\s+/, ''),
      version: '1.0.0',
      description: shouldAuth ? readmeLines.join('\n').trim() : '',
    },
  },

  plugins: [
    ...(shouldAuth ? [useAuth()] : []), // block non-cloudflare requests only in production
    useAuditLog(),
  ],
})
  .route({
    method: 'POST',
    path: '/ping',
    description:
      'Please use this harmless endpoint to test if your connection with API is wired up correctly.',
    schemas: {
      request: {
        json: Type.Object(
          {
            echo: Type.String({
              description: 'Text that will be included in response message',
            }),
          },
          { additionalProperties: false }
        ),
      },
    },
    handler: async (request: Request) =>
      Response.json(pingHandler(await request.json())),
  })
  .route({
    method: 'POST',
    path: '/moderation/blockUser',
    description:
      'Block the specified user by marking all their content as BLOCKED.',
    schemas: {
      request: {
        json: Type.Object(
          {
            userId: Type.String({
              description: 'The user ID to block',
            }),
            blockedReason: Type.String({
              description: 'The URL to the announcement that blocks this user',
            }),
          },
          { additionalProperties: false }
        ),
      },
      responses: {
        200: Type.Object({
          updatedArticles: Type.Number(),
          updatedReplyRequests: Type.Number(),
          updatedArticleReplies: Type.Number(),
          updateArticleReplyFeedbacks: Type.Number(),
        }),
      },
    },
    handler: async (request: Request) =>
      Response.json(await blockUser(await request.json())),
  })
  .route({
    method: 'POST',
    path: '/badge/award',
    description: 'Award the badge to the specified user.',
    schemas: {
      request: {
        json: Type.Object(
          {
            userId: Type.String({
              description: 'The user ID',
            }),
            badgeId: Type.String({
              description: 'The badge key',
            }),
            badgeMetaData: Type.String({
              description: 'The badge metadata, json in string format',
            }),
          },
          { additionalProperties: false }
        ),
      },
      responses: {
        200: Type.Object({
          badgeId: Type.String(),
          badgeMetaData: Type.String(),
        }),
      },
    },
    handler: async (request: Request) => {
      const body = await request.json();
      return Response.json(
        await awardBadge({
          ...body,
          request, // Pass the entire request object from feTS
        })
      );
    },
  })
  .route({
    method: 'POST',
    path: '/moderation/article/media',
    description:
      "Replace the specified article's media with content from the given URL.",
    schemas: {
      request: {
        json: Type.Object(
          {
            articleId: Type.String({
              description:
                'The ID of the article whose media should be replaced',
            }),
            url: Type.String({
              description: 'The URL pointing to the new media content',
              format: 'uri', // Add format validation for URL
            }),
            force: Type.Optional(
              Type.Boolean({
                description:
                  'If true, skip checking if the old media entry exists before replacing',
                default: false,
              })
            ),
          },
          { additionalProperties: false }
        ),
      },
      responses: {
        200: Type.Object(
          {
            attachmentHash: Type.String({
              description: 'The attachment hash of the newly uploaded media',
            }),
          },
          { additionalProperties: false }
        ),
        // Add potential error responses based on the handler
        400: Type.Object({ message: Type.String() }), // e.g., old media missing and force=false
        404: Type.Object({ message: Type.String() }), // e.g., article not found
        500: Type.Object({ message: Type.String() }), // Internal server error
      },
    },
    handler: async (request) =>
      Response.json(await replaceMediaHandler(await request.json())),
  });

createServer(router).listen(process.env.ADM_PORT, () => {
  console.log(`[Adm] API is running on port ${process.env.ADM_PORT}`);
});
