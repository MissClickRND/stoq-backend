// Run with node deploy/local-ai-supervisor.cjs PATH_TO_RUNTIME_DIRECTORY.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const runtime = path.resolve(process.argv[2]);
const settings = JSON.parse(fs.readFileSync(path.join(runtime, 'settings.json'), 'utf8'));
const log = fs.openSync(path.join(runtime, 'supervisor.log'), 'a');
const write = message => fs.writeSync(log, `${new Date().toISOString()} ${message}\n`);
let stopping = false;
const children = new Set();
function launch(command, args, options = {}) {
  const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', log, log], ...options });
  children.add(child);
  child.on('exit', code => { children.delete(child); write(`${path.basename(command)} exited ${code}`); });
  child.on('error', error => write(error.message));
  return child;
}
async function portOpen(port) {
  return new Promise(resolve => { const socket = net.connect({ host: '127.0.0.1', port }); socket.setTimeout(1000); const finish = result => { socket.destroy(); resolve(result); }; socket.once('connect', () => finish(true)); socket.once('error', () => finish(false)); socket.once('timeout', () => finish(false)); });
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  while (!stopping) {
    const tunnel = launch(settings.ssh, ['-NT', '-i', settings.key, '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${settings.knownHosts}`, '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3', '-L', `127.0.0.1:${settings.brokerPort}:127.0.0.1:5672`, `stoq-ai-tunnel@${settings.host}`]);
    for(let attempt=0; attempt<30 && !stopping && tunnel.exitCode===null; attempt++) { if(await portOpen(settings.brokerPort))break; await sleep(1000); }
    if (!stopping && tunnel.exitCode===null && await portOpen(settings.brokerPort)) {
      const worker = launch(process.execPath, [path.join(settings.service, 'dist/main.js')], { cwd: runtime, env: { ...process.env, NODE_ENV:'production' } });
      write('AI worker started with encrypted broker connection');
      await Promise.race([new Promise(resolve=>tunnel.once('exit',resolve)),new Promise(resolve=>worker.once('exit',resolve))]);
      worker.kill();
    }
    tunnel.kill();
    if(!stopping) await sleep(5000);
  }
}
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{stopping=true;for(const child of children)child.kill();});
main().catch(error=>{write(error.stack);process.exitCode=1});
