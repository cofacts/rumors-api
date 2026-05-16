import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { graphql } from 'graphql';
import schema from './graphql/schema';
import contextFactory from './contextFactory';
import { verifyJWT, TOKEN_USE_ACCESS } from './lib/jwt';

export async function handleMcpRequest(ctx) {
  const authHeader = ctx.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    ctx.status = 401;
    ctx.set('WWW-Authenticate', 'Bearer');
    ctx.body = { error: 'unauthorized' };
    return;
  }

  let payload;
  try {
    payload = await verifyJWT(authHeader.slice('Bearer '.length), {
      expectedUse: TOKEN_USE_ACCESS,
    });
  } catch {
    ctx.status = 401;
    ctx.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    ctx.body = { error: 'invalid_token' };
    return;
  }

  const gqlContext = await contextFactory({
    ctx: {
      appId: 'MCP',
      query: {},
      state: { user: { userId: payload.sub } },
    },
  });

  const server = new McpServer({ name: 'cofacts-api', version: '1.0.0' });

  server.tool(
    'execute_graphql',
    'Execute a GraphQL query or mutation against the Cofacts API',
    {
      query: z.string().describe('GraphQL query or mutation string'),
      variables: z.record(z.unknown()).optional().describe('GraphQL variables'),
      operationName: z.string().optional().describe('Operation name'),
    },
    async ({ query, variables, operationName }) => {
      const result = await graphql({
        schema,
        source: query,
        variableValues: variables,
        operationName,
        contextValue: gqlContext,
      });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  ctx.respond = false;
  await transport.handleRequest(ctx.req, ctx.res, ctx.request.body);
}
