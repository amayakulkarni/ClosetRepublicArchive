// Run: npm test
// Needs Docker with postgres:16-alpine available for the integration cases;
// those cases are skipped automatically when Docker is unavailable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { SMTPServer } from 'smtp-server';
import { parseEnvFile, buildConfig } from '../src/config.js';
import { prune, timestamp } from '../src/backup.js';

const SRC = path.resolve(import.meta.dirname, '../src/backup.js');

function startSmtp() {
  const messages = [];
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ['STARTTLS'],
    onData(stream, _s, cb) {
      let d = '';
      stream.on('data', (c) => (d += c));
      stream.on('end', () => { messages.push(d); cb(); });
    },
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, messages, port: server.server.address().port })));
}

const baseEnv = (extra = {}) => ({
  DB_NAME: 'wikijs', DB_USER: 'wikijs', SMTP_HOST: '127.0.0.1', SMTP_PORT: '2525',
  MAIL_FROM: 'Wiki <wiki@example.org>', BACKUP_ALERT_EMAIL: 'amaya@example.org', ...extra,
});

test('parseEnvFile handles quotes and comments', () => {
  const e = parseEnvFile('A=1\n# c\nB="x y"\nC=z # note\n');
  assert.deepEqual(e, { A: '1', B: 'x y', C: 'z' });
});

test('buildConfig flags placeholders and bad values', () => {
  const { problems } = buildConfig(baseEnv({ DB_USER: 'CHANGE_ME', BACKUP_RETENTION_DAYS: '0', BACKUP_ALERT_EMAIL: 'nope' }));
  assert.ok(problems.some((p) => p.startsWith('DB_USER')));
  assert.ok(problems.some((p) => p.includes('RETENTION')));
  assert.ok(problems.some((p) => p.includes('valid email')));
});

test('prune removes old files but keeps the newest minKeep', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prune-'));
  const now = Date.parse('2026-10-16T00:00:00Z');
  for (let d = 0; d < 6; d++) {
    const f = `wikijs-${timestamp(new Date(now - d * 10 * 86_400_000))}.dump`;
    fs.writeFileSync(path.join(dir, f), 'x');
    fs.writeFileSync(path.join(dir, f + '.sha256'), 'x');
  }
  fs.writeFileSync(path.join(dir, 'unrelated.txt'), 'x');
  const removed = prune(dir, { retentionDays: 14, minKeep: 3 }, now);
  assert.equal(removed.length, 3);
  assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.dump')).length, 3);
  assert.ok(fs.existsSync(path.join(dir, 'unrelated.txt')));
  const none = prune(dir, { retentionDays: 1, minKeep: 3 }, now);
  assert.equal(none.length, 0);
});

// Async so the in-process mock SMTP server can answer while the CLI runs.
function runCliAsync(args, env) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'env-')), '.env');
  fs.writeFileSync(f, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'));
  return new Promise((resolve) => {
    const p = spawn('node', [SRC, '--env', f, ...args], { env: { PATH: process.env.PATH } });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => (stdout += d));
    p.stderr.on('data', (d) => (stderr += d));
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function runCli(args, env) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'env-')), '.env');
  fs.writeFileSync(f, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'));
  return spawnSync('node', [SRC, '--env', f, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH } });
}

test('--test-failure sends the alert email via mock SMTP', async () => {
  const { server, messages, port } = await startSmtp();
  const r = await runCliAsync(['--test-failure'], baseEnv({ SMTP_PORT: String(port), SMTP_INSECURE_FOR_TESTS: 'true', BACKUP_DIR: os.tmpdir() }));
  server.close();
  assert.equal(r.status, 1, r.stderr);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /Subject: \[Wiki backup FAILED\]/);
  assert.match(messages[0], /Deliberate test failure/);
  assert.match(messages[0], /To: amaya@example.org/);
});

test('missing container fails and alerts', async () => {
  const { server, messages, port } = await startSmtp();
  const r = await runCliAsync([], baseEnv({ SMTP_PORT: String(port), SMTP_INSECURE_FOR_TESTS: 'true', BACKUP_DB_CONTAINER: 'no-such-container-xyz', BACKUP_DIR: os.tmpdir() }));
  server.close();
  assert.equal(r.status, 1);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /container check/);
});

test('unreachable SMTP does not crash; exit code stays 1', () => {
  const r = runCli(['--test-failure'], baseEnv({ SMTP_PORT: '1', SMTP_INSECURE_FOR_TESTS: 'true' }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Alert email could not be sent/);
});

let dockerOk = false;
try { execFileSync('docker', ['info'], { stdio: 'ignore' }); dockerOk = true; } catch {}

test('integration: real dump, verify, prune, dry-run', { skip: !dockerOk }, async () => {
  const name = 'wikijs-backup-test-db';
  try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch {}
  execFileSync('docker', ['run', '-d', '--name', name, '-e', 'POSTGRES_DB=wikijs', '-e', 'POSTGRES_USER=wikijs', '-e', 'POSTGRES_PASSWORD=pw', 'postgres:16-alpine'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 30; i++) {
      const r = spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'wikijs', '-h', '127.0.0.1']);
      if (r.status === 0) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    await new Promise((r) => setTimeout(r, 2000));
    execFileSync('docker', ['exec', name, 'psql', '-U', 'wikijs', '-h', '127.0.0.1', '-c', "create table pages(id serial, body text); insert into pages(body) select repeat('é',200) from generate_series(1,50);"]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-'));
    const env = baseEnv({ BACKUP_DB_CONTAINER: name, BACKUP_DIR: dir, SMTP_INSECURE_FOR_TESTS: 'true' });
    const dry = runCli(['--dry-run'], env);
    assert.equal(dry.status, 0, dry.stderr + dry.stdout);
    assert.equal(fs.readdirSync(dir).length, 0);
    const r = runCli([], env);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const dumps = fs.readdirSync(dir).filter((f) => f.endsWith('.dump'));
    assert.equal(dumps.length, 1);
    assert.ok(fs.statSync(path.join(dir, dumps[0])).size > 1024);
    assert.ok(fs.existsSync(path.join(dir, dumps[0] + '.sha256')));
    assert.equal(fs.readdirSync(dir).filter((f) => f.endsWith('.partial')).length, 0);
  } finally {
    execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
  }
});
