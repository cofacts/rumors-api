import type { Context, Next } from 'koa';

/**
 * Creates a middleware that sends a preliminary header after a timeout
 * to keep the connection alive with Cloudflare
 * @param timeout - Timeout in milliseconds before sending the header. Default to lower than Cloudflare's Proxy Read Timeout.
 * @returns Koa middleware function
 */
export default function timeoutHeader(timeout = 90000) {
  return async (ctx: Context, next: Next): Promise<void> => {
    // Create a timer to send headers
    const timer = setTimeout(() => /* istanbul ignore next */ {
      if (!ctx.headerSent) {
        console.log(
          '[timeoutHeader] Sending preliminary header after',
          timeout,
          'ms'
        );
        ctx.set('Content-Encoding', 'identity');
        ctx.flushHeaders();
      }
    }, timeout);

    try {
      await next();
    } finally {
      clearTimeout(timer);
    }
  };
}
