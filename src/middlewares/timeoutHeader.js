/**
 * Creates a middleware that sends a preliminary header after a timeout
 * to keep the connection alive with Cloudflare
 * @param {number} timeout Timeout in milliseconds before sending the header
 * @returns {Function} Koa middleware
 */
export default function timeoutHeader(timeout = 30000) {
  return async (ctx, next) => {
    let headerSent = false;

    // Create a timer to send headers
    const timer = setTimeout(() => {
      if (!ctx.response.headerSent) {
        ctx.set('Content-Encoding', 'identity');
        ctx.flushHeaders();
        headerSent = true;
      }
    }, timeout);

    try {
      await next();
    } finally {
      clearTimeout(timer);
    }
  };
}
