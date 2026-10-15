// One tunnel and one worker per service. No changes to the services' RPC transport.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { parseEnv } = require('node:util');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = child => child.exitCode === null && child.signalCode === null && !child.failed;
function sshArguments(s) {
  return ['-NT','-i',s.key,'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${s.knownHosts}`,'-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=20','-o','ServerAliveCountMax=3','-L',`127.0.0.1:${s.brokerPort}:127.0.0.1:5672`,'-L',`127.0.0.1:${s.databasePort}:127.0.0.1:5432`,`${s.user}@${s.host}`];
}
function workerEnvironment(file, base = process.env) {
  return {...base,...parseEnv(fs.readFileSync(file,'utf8')),NODE_ENV:'production'};
}
function redact(message, secrets = []) {
  let text = String(message).replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,'[REDACTED KEY]').replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi,'$1[REDACTED]@').replace(/((?:token|password|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi,'$1[REDACTED]');
  for (const secret of secrets.filter(value => value && value.length >= 3).sort((a,b)=>b.length-a.length)) text = text.split(secret).join('[REDACTED]');
  return text;
}
async function stopChildren(children) {
  for (const child of children) if (alive(child)) child.kill();
  for (let attempt=0; attempt<30 && children.some(alive); attempt++) await sleep(100);
  for (const child of children) if (alive(child)) child.kill('SIGKILL');
}
function portOpen(port) {
  return new Promise(resolve => { const socket=net.connect({host:'127.0.0.1',port}); let done=false; const finish=value=>{if(done)return;done=true;socket.destroy();resolve(value);}; socket.setTimeout(500);socket.once('connect',()=>finish(true));socket.once('error',()=>finish(false));socket.once('timeout',()=>finish(false)); });
}
async function run(runtime) {
  const settings=JSON.parse(fs.readFileSync(path.join(runtime,'settings.json'),'utf8'));
  const environments=settings.services.map(service=>workerEnvironment(service.envFile));
  const secrets=environments.flatMap(env=>Object.entries(env).filter(([key])=>/token|password|secret|key|url|uri/i.test(key)).map(([,value])=>value));
  const logFile=path.join(runtime,'supervisor.log');
  const write=message=>{if(fs.existsSync(logFile)&&fs.statSync(logFile).size>2*1024*1024)fs.renameSync(logFile,`${logFile}.1`);fs.appendFileSync(logFile,`${new Date().toISOString()} ${redact(message,secrets).slice(0,8192)}\n`);};
  const pidFile=path.join(runtime,'supervisor.pid');
  const lockFile=path.join(runtime,'supervisor.lock');
  // The launcher removes stale locks only after verifying the previous process identity.
  const lock=fs.openSync(lockFile,'wx');
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
  fs.closeSync(lock);
  fs.writeFileSync(pidFile,String(process.pid));
  let stopping=false; let children=[]; let failures=0;
  const state=status=>fs.writeFileSync(path.join(runtime,'state.json'),JSON.stringify({pid:process.pid,status,updatedAt:new Date().toISOString(),children:children.filter(alive).map(child=>({name:child.label,pid:child.pid}))},null,2));
  const launch=(name,command,args,options={})=>{const child=spawn(command,args,{windowsHide:true,stdio:['ignore','pipe','pipe'],...options});child.label=name;child.failed=false;child.once('error',()=>{child.failed=true;write(`${name}: process launch failed`);});child.once('exit',code=>write(`${name}: exited (${code})`));
    // Stream chunks are never persisted: workers may log arbitrary request payloads or secrets.
    child.stdout.resume();child.stderr.resume();children.push(child);return child;};
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;for(const child of children)if(alive(child))child.kill();});
  try {
    while(!stopping){
      children=[];state('connecting');const started=Date.now();
      try {
        const tunnel=launch('ssh',settings.ssh,sshArguments(settings));
        let ready=false;
        for(let attempt=0;attempt<60&&!stopping&&alive(tunnel);attempt++) {ready=(await Promise.all([portOpen(settings.brokerPort),portOpen(settings.databasePort)])).every(Boolean);if(ready&&alive(tunnel))break;await sleep(500);}
        if(!stopping&&ready&&alive(tunnel)){
          for(let index=0;index<settings.services.length;index++){const service=settings.services[index];launch(service.name,process.execPath,[path.join(service.directory,service.entry||'dist/main.js')],{cwd:service.directory,env:environments[index]});}
          state('running');write('Tunnel and service workers started');
          while(!stopping&&children.every(alive))await sleep(500);
        }
      } finally {await stopChildren(children);state(stopping?'stopped':'reconnecting');}
      if(!stopping){failures=Date.now()-started>60000?0:failures+1;const delay=Math.min(30000,1000*2**Math.min(failures,5));write(`Restarting services in ${delay} ms`);await sleep(delay);}
    }
  } finally {await stopChildren(children);state('stopped');fs.rmSync(pidFile,{force:true});fs.rmSync(lockFile,{force:true});}
}
module.exports={sshArguments,workerEnvironment,redact,stopChildren};
if(require.main===module)run(path.resolve(process.argv[2]||path.join(__dirname,'..','.tmp','local-services-runtime'))).catch(()=>{process.stderr.write('Local services supervisor failed; check runtime settings and process state.\n');process.exitCode=1;});
