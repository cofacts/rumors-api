import 'dotenv/config';

import { createServer } from 'node:http';
import { createRouter, Response } from 'fets';
import { useAuditLog } from './util';

const router = createRouter({
  // Include audit log plugin and block non-cloudflare requests only in production
  //
  plugins: process.env.NODE_ENV === 'production' ? [useAuditLog()] : [],
}).route({
  method: 'GET',
  path: '/greetings',
  schemas: {
    responses: {
      200: {
        type: 'object',
        properties: {
          hello: { type: 'string' },
        },
      },
    },
  },
  handler: () => Response.json({ hello: 'world' }),
});

createServer(router).listen(process.env.ADM_PORT, () => {
  console.log(`[Adm] API is running on port ${process.env.ADM_PORT}`);
});
