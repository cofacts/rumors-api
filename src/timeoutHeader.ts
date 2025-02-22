import type { Context, Next } from 'koa';

/**
 * Creates a middleware that sends a preliminary header after a timeout
 * to keep the connection alive with Cloudflare
 * @param {number} timeout Timeout in milliseconds before sending the header
 * @returns Koa middleware function
 */
export default function timeoutHeader(timeout = 30000) {
  return async (ctx: Context, next: Next): Promise<void> => {
    // Create a timer to send headers
    const timer = setTimeout(() => {
      if (!ctx.headerSent) {
        console.log('[timeoutHeader] Sending preliminary header after', timeout, 'ms');
        ctx.set('X-Accel-Buffering', 'no');
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
