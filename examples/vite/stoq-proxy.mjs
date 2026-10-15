/** Merge the returned object into server.proxy in the frontend's existing Vite config. */
export function stoqProxy(target = 'http://127.0.0.1:3000') {
  const url = new URL(target);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('STOQ_BACKEND_URL must be an HTTP(S) origin, e.g. http://192.168.1.50:3000');
  }
  return {
    '/api': {
      target: url.origin,
      changeOrigin: true,
      ws: true,
      rewrite: path => path.replace(/^\/api(?=\/|\?|$)/, '') || '/',
      // Applied to login, refresh AND logout so cookie creation/deletion use the same path.
      cookiePathRewrite: { '/auth': '/api/auth' },
      proxyTimeout: 180000,
      timeout: 180000,
    },
  };
}
