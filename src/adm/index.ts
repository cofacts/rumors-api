import { createServer } from 'node:http';
import { createRouter, Response } from 'fets';

const router = createRouter().route({
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
