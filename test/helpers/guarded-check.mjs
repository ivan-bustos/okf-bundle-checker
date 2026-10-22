// Test-only subprocess instrumentation. These guards are assertions, not an OS sandbox.
import {syncBuiltinESMExports} from 'node:module';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import dgram from 'node:dgram';
import childProcess from 'node:child_process';
import workerThreads from 'node:worker_threads';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const options = JSON.parse(process.argv[2]);
// Match discovery's canonical paths, including macOS /var -> /private/var.
// Canonicalization is setup, before the read-fault instrumentation is installed.
const canonical = async path => fsp.realpath(resolve(path)).catch(() => resolve(path));
options.bundle = await canonical(options.bundle);
options.forbiddenReads = await Promise.all((options.forbiddenReads ?? []).map(canonical));
if (options.fault) options.fault.path = await canonical(options.fault.path);
const blocked = [];
const injected = [];
const opened = [];
function deny(label) {
  return function () {
    blocked.push(label);
    throw new Error(`Acceptance guard blocked ${label}`);
  };
}
const families = [
  [http, ['request', 'get'], 'http'],
  [https, ['request', 'get'], 'https'],
  [http2, ['connect'], 'http2'],
  [net, ['connect', 'createConnection'], 'net'],
  [tls, ['connect'], 'tls'],
  [dns, ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse'], 'dns'],
  [dnsPromises, ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse'], 'dns.promises'],
  [dgram, ['createSocket'], 'dgram'],
  [childProcess, ['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork'], 'child_process'],
  [workerThreads, ['Worker'], 'worker_threads'],
  [vm, ['Script', 'compileFunction', 'runInContext', 'runInNewContext', 'runInThisContext'], 'vm'],
];
for (const [module, names, prefix] of families) {
  for (const name of names) module[name] = deny(`${prefix}.${name}`);
}
net.Socket.prototype.connect = deny('net.Socket.connect');
for (const name of ['fetch', 'WebSocket', 'EventSource', 'eval', 'Function']) {
  globalThis[name] = deny(`globalThis.${name}`);
}

function filename(value) {
  if (value instanceof URL) return fileURLToPath(value);
  if (typeof value === 'string' || Buffer.isBuffer(value)) return resolve(String(value));
  return '';
}
function fault(operation, path) {
  if (options.fault?.operation !== operation || filename(path) !== resolve(options.fault.path)) return;
  injected.push(operation);
  throw Object.assign(new Error('Synthetic permission failure, including privileged hosts'), {code: 'EACCES'});
}
function checkRead(path) {
  const absolute = filename(path);
  opened.push(absolute);
  if ((options.forbiddenReads ?? []).some(item => absolute === resolve(item))) return deny('forbidden-file-read')();
}
for (const operation of ['open', 'opendir', 'lstat', 'rename']) {
  const original = fsp[operation];
  fsp[operation] = async function (path, ...args) {
    fault(operation, operation === 'rename' ? args[0] : path);
    if (operation === 'open') checkRead(path);
    const value = await original.call(this, path, ...args);
    if (operation === 'opendir' && options.syntheticName && filename(path) === resolve(options.bundle)) {
      // Insert a filename even when the host OS cannot create it (e.g. Windows controls).
      return {async *[Symbol.asyncIterator]() {
        yield {name: options.syntheticName};
        for await (const entry of value) yield entry;
      }};
    }
    return value;
  };
}
for (const operation of ['readFile', 'readFileSync', 'open', 'openSync', 'createReadStream']) {
  const original = fs[operation];
  fs[operation] = function (path, ...args) {
    checkRead(path);
    return original.call(this, path, ...args);
  };
}
const originalReadFile = fsp.readFile;
fsp.readFile = async function (path, ...args) {
  checkRead(path);
  return originalReadFile.call(this, path, ...args);
};
syncBuiltinESMExports();

// Verify that representative traps themselves work, then reset their counters.
for (const probe of [() => globalThis.fetch('https://example.invalid'), () => http.get('http://example.invalid'), () => childProcess.exec('not-executed'), () => vm.runInNewContext('1'), () => globalThis.eval('1')]) {
  const before = blocked.length;
  try { probe(); } catch { /* The guard must throw before dispatching any work. */ }
  if (blocked.length !== before + 1) throw new Error('Acceptance guard self-test failed');
}
blocked.length = 0;
const {run} = await import('../../dist/cli.js');
let stdout = '';
let stderr = '';
const status = await run(options.args, text => {stdout += text;}, text => {stderr += text;});
process.stdout.write(JSON.stringify({status, stdout, stderr, blocked, injected, opened}) + '\n');
