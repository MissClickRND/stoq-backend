import test from 'node:test';
import assert from 'node:assert/strict';
import { stoqProxy } from './stoq-proxy.mjs';

test('HTTP, refresh cookies and Socket.IO use the same proxy', () => {
  const proxy = stoqProxy('http://192.168.1.50:3000')['/api'];
  assert.equal(proxy.target, 'http://192.168.1.50:3000');
  assert.equal(proxy.rewrite('/api/auth/login'), '/auth/login');
  assert.equal(proxy.rewrite('/api/auth/refresh'), '/auth/refresh');
  assert.equal(proxy.rewrite('/api/auth/logout'), '/auth/logout');
  assert.equal(proxy.rewrite('/api/socket.io/?EIO=4&transport=websocket'), '/socket.io/?EIO=4&transport=websocket');
  assert.equal(proxy.rewrite('/api/menu?search=soup'), '/menu?search=soup');
  assert.equal(proxy.cookiePathRewrite['/auth'], '/api/auth');
  assert.equal(proxy.ws, true);
  assert.equal(proxy.changeOrigin, true);
});

test('rejects targets containing paths, credentials or a non-HTTP protocol', () => {
  for (const url of ['file:///tmp', 'http://user:password@host:3000', 'http://host:3000/api', 'http://host:3000/?key=secret']) {
    assert.throws(() => stoqProxy(url));
  }
});
