/**
 * Creates a middleware that sends a preliminary header after a timeout
 * to keep the connection alive with Cloudflare
 * @param {number} timeout Timeout in milliseconds before sending the header
 * @returns {Function} Koa middleware
 */
export default function timeoutHeader(timeout = 30000) {
  return async (ctx, next) => {
    // Create a timer to send headers
    const timer = setTimeout(() => {
      if (!ctx.headerSent) {
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
