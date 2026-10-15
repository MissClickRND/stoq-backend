import { defineConfig, loadEnv } from 'vite';
import { stoqProxy } from './stoq-proxy.mjs';

// Keep the framework plugins/aliases from your existing config; merge server.proxy below.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'STOQ_');
  return {
    server: {
      proxy: stoqProxy(env.STOQ_BACKEND_URL || 'http://127.0.0.1:3000'),
    },
  };
});
