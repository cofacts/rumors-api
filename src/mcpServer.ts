import type { Context } from 'koa';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { graphql, parse, type OperationDefinitionNode } from 'graphql';
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

  function getOperationType(src: string) {
    const doc = parse(src);
    const op = doc.definitions.find(
      (d): d is OperationDefinitionNode => d.kind === 'OperationDefinition'
    );
    return op?.operation ?? null;
  }

  const gqlInputSchema = {
    query: z.string().describe('GraphQL document string'),
    variables: z.record(z.unknown()).optional().describe('GraphQL variables'),
    operationName: z.string().optional().describe('Operation name'),
  };

  async function runGraphQL(
    query: string,
    variables: Record<string, unknown> | undefined,
    operationName: string | undefined
  ) {
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
  }

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore TS2589: Zod 3.25 generics exceed TypeScript's type instantiation depth limit
  server.registerTool(
    'graphql_query',
    {
      description: 'Execute a GraphQL query against the Cofacts API',
      inputSchema: gqlInputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    async ({ query, variables, operationName }) => {
      try {
        if (getOperationType(query) !== 'query') {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Error: graphql_query only accepts query operations.\nUse graphql_mutate for mutations.',
              },
            ],
          };
        }
      } catch {
        // Invalid syntax — graphql() will surface the parse error
      }
      return runGraphQL(query, variables, operationName);
    }
  );

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore TS2589: Zod 3.25 generics exceed TypeScript's type instantiation depth limit
  server.registerTool(
    'graphql_mutate',
    {
      description: 'Execute a GraphQL mutation against the Cofacts API',
      inputSchema: gqlInputSchema,
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ query, variables, operationName }) => {
      try {
        if (getOperationType(query) !== 'mutation') {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'Error: graphql_mutate only accepts mutation operations.\nUse graphql_query for queries.',
              },
            ],
          };
        }
      } catch {
        // Invalid syntax — graphql() will surface the parse error
      }
      return runGraphQL(query, variables, operationName);
    }
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  ctx.respond = false;
  await transport.handleRequest(ctx.req, ctx.res, ctx.request.body);
}
