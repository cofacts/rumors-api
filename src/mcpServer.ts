import type { Context } from 'koa';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { graphql } from 'graphql';
import schema from './graphql/schema';
import contextFactory from './contextFactory';
import { verifyJWT, TOKEN_USE_ACCESS } from './lib/jwt';

export async function handleMcpRequest(ctx: Context): Promise<void> {
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
      state: { user: { userId: payload.sub as string } },
    },
  });

  const server = new McpServer({ name: 'cofacts-api', version: '1.0.0' });

  // Pre-typed handler so TypeScript doesn't need to infer its parameter types
  // through server.tool() overload resolution (which hits TS2589 with Zod 3.25).
  const executeGraphQL = async ({
    query,
    variables,
    operationName,
  }: {
    /** GraphQL query or mutation document string. */
    query: string;
    /** Optional variables map passed to the GraphQL executor. */
    variables?: Record<string, unknown>;
    /** Optional operation name when the document contains multiple operations. */
    operationName?: string;
  }) => {
    const result = await graphql({
      schema,
      source: query,
      variableValues: variables,
      operationName,
      contextValue: gqlContext,
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    };
  };

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore TS2589: Zod 3.25 generics exceed TypeScript's type instantiation depth limit
  server.tool(
    'execute_graphql',
    'Execute a GraphQL query or mutation against the Cofacts API',
    {
      query: z.string().describe('GraphQL query or mutation string'),
      variables: z.record(z.unknown()).optional().describe('GraphQL variables'),
      operationName: z.string().optional().describe('Operation name'),
    },
    executeGraphQL
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  ctx.respond = false;
  await transport.handleRequest(ctx.req, ctx.res, ctx.request.body);
}
