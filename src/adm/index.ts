import 'dotenv/config';

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRouter, Response } from 'fets';
import { Type } from '@sinclair/typebox';

import { useAuditLog, useAuth } from './util';

import pingHandler from './handlers/ping';
import blockUser from './handlers/moderation/blockUser';

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
    handler: async (request) =>
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
    handler: async (request) =>
      Response.json(await blockUser(await request.json())),
  });

createServer(router).listen(process.env.ADM_PORT, () => {
  console.log(`[Adm] API is running on port ${process.env.ADM_PORT}`);
});
