const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const api = require('./local-services-supervisor.cjs');
test('SSH forwards both private endpoints with strict authentication', () => {
  const args = api.sshArguments({key:'key',knownHosts:'hosts',host:'server',user:'stoq-local-services',brokerPort:15674,databasePort:15432});
  for (const value of ['127.0.0.1:15674:127.0.0.1:5672','127.0.0.1:15432:127.0.0.1:5432','ExitOnForwardFailure=yes','StrictHostKeyChecking=yes','stoq-local-services@server']) assert.ok(args.includes(value));
});
test('worker environment is parsed independently and forces production', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'stoq-env-'));
  try { const file = path.join(dir,'worker.env'); fs.writeFileSync(file,'TOKEN="hello world"\nNODE_ENV=development\n'); const env = api.workerEnvironment(file,{PATH:'bin'}); assert.equal(env.TOKEN,'hello world'); assert.equal(env.NODE_ENV,'production'); assert.equal(env.PATH,'bin'); } finally { fs.rmSync(dir,{recursive:true}); }
});
test('redacts known values, URL credentials and key material', () => {
  const result = api.redact('token=abc https://user:password@host -----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----', ['abc']);
  for (const secret of ['abc','password','private']) assert.ok(!result.includes(secret));
});
test('cycle cleanup terminates every surviving child before reconnect', async () => {
  const calls=[]; await api.stopChildren([{exitCode:null,signalCode:null,kill(){calls.push('ai');this.exitCode=0;}},{exitCode:null,signalCode:null,kill(){calls.push('ssh');this.exitCode=0;}}]); assert.deepEqual(calls,['ai','ssh']);
});
