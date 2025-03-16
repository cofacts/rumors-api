import pino from 'pino';
import { HTTPError } from 'fets';
import type { RouterPlugin } from 'fets';
import { jwtVerify, createRemoteJWKSet, JWTPayload } from 'jose';

/** HTTP request headers to include in audit log */
const HEADERS_TO_INCLUDE = new Set([
  'cf-access-authenticated-user-email',
  'cf-connecting-ip',
  'cf-ipcountry',
]);

/**
 * JWT token content to include in audit log.
 *
 * Ref: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/application-token/
 * */
const TOKEN_KEYS = [
  'aud',
  'exp',
  'iat',
  'country',
  'email', // For identity-based auth
  'common_name', // For service token auth
] as const;
const TOKEN_KEY_SET = new Set(TOKEN_KEYS as ReadonlyArray<string>);

type CloudflareJWTPayload = JWTPayload & {
  country?: string;
  email?: string;
  common_name?: string;
};

/**
 * Attach user & userId to global Reqest
 * @ref: https://github.com/ardatan/whatwg-node/blob/master/packages/server-plugin-cookies/src/useCookies.ts
 */
declare global {
  interface Request {
    /** Currently logged-in admin's token information */
    user?: Pick<CloudflareJWTPayload, (typeof TOKEN_KEYS)[number]>;
    /** Currently logged-in admin's user ID for use in Cofacts DB */
    userId?: string;
  }
}

/**
 * Verifying Cloudflare Access token.
 *
 * Ref: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/#javascript-example
 */
const TEAM_DOMAIN = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN;
const CERTS_URL = `${TEAM_DOMAIN}/cdn-cgi/access/certs`;
const JWKS = createRemoteJWKSet(new URL(CERTS_URL));

const logger = pino({ name: 'Admin API' });

export function useAuth(): RouterPlugin<any, any> {
  return {
    async onRequest({ request }) {
      const token = request.headers.get('cf-access-jwt-assertion');
      if (!token) {
        throw new HTTPError(
          403,
          'Unauthorized',
          {},
          { message: 'Missing Cloudflare access token' }
        );
      }

      let payload: CloudflareJWTPayload;
      try {
        payload = (
          await jwtVerify(token, JWKS, {
            issuer: TEAM_DOMAIN,
          })
        ).payload;
      } catch (e) {
        logger.error(e, 'Cloudflare access token verification failed');
        throw new HTTPError(403, 'Unauthorized', {});
      }

      request.user = Object.fromEntries(
        Object.entries(payload).filter(([key]) => TOKEN_KEY_SET.has(key))
      );
      request.userId = payload.email ?? payload.common_name;
    },
  };
}

/**
 * Log request, response and user information.
 *
 * Abort request if it's not coming from Cloudflare Access.
 *
 * Ref: https://the-guild.dev/openapi/fets/server/plugins
 */
export function useAuditLog(): RouterPlugin<any, any> {
  return {
    async onRequest({ request }) {
      // Skip logging for GET requests
      if (request.method === 'GET') return;

      const { url, user, userId } = request;
      const shouldIncludeBody =
        'common_name' in (request.user ?? {}) /* Called via service tokens */ ||
        request.headers.get('content-type') ===
          'application/json'; /* Probably from Swagger UI */

      logger.info(
        {
          url,
          user,
          userId,
          id: request.headers.get('cf-ray'),
          headers: Object.fromEntries(
            [...request.headers.entries()].filter(([key]) =>
              HEADERS_TO_INCLUDE.has(key)
            )
          ),
          req: shouldIncludeBody ? await request.json() : undefined,
        },
        'Req start'
      );
    },

    async onResponse({ request, response }) {
      // Skip logging for GET requests
      if (request.method === 'GET') return;

      const shouldIncludeBody =
        response.ok &&
        (response.headers.get('content-type') ?? '').startsWith(
          'application/json'
        );

      logger.info(
        {
          id: request.headers.get('cf-ray'),
          url: request.url,
          status: response.status,
          res: shouldIncludeBody ? await response.json() : undefined,
        },
        'Req end'
      );
    },
  };
}
