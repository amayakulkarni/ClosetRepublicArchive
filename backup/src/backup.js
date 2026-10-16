#!/usr/bin/env node
// Daily PostgreSQL backup for Wiki.js.
//
// Runs pg_dump inside the db container (docker exec), so the dump always
// uses the same client version as the server and needs no host install of
// the Postgres client or any exposed database port. Output is the pg_dump
// custom format (-Fc), which is compressed and restorable with pg_restore.
//
// Usage:
//   node src/backup.js                 normal run
//   node src/backup.js --dry-run       validate config, container and disk; write nothing
//   node src/backup.js --test-failure  force a failure to prove the alert email works
//   node src/backup.js --env /path/.env

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { loadEnv, buildConfig } from './config.js';
import { sendMail } from './mail.js';

const PREFIX = 'wikijs-';
const SUFFIX = '.dump';
const NAME_RE = /^wikijs-(\d{8}T\d{6}Z)\.dump$/;

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

export function timestamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function run(bin, args, { timeoutMs = 60_000, input } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const t = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error(`${bin} ${args[0]} timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => {
      clearTimeout(t);
      reject(new Error(`Cannot run "${bin}": ${e.message}`));
    });
    p.on('close', (code) => {
      clearTimeout(t);
      code === 0 ? resolve(out) : reject(new Error(`${bin} ${args.join(' ')} exited ${code}: ${err.trim().slice(-800)}`));
    });
    p.stdin.end(input);
  });
}

export async function checkContainer(config) {
  const state = (
    await run(config.dockerBin, ['inspect', '-f', '{{.State.Running}}', config.container])
  ).trim();
  if (state !== 'true') throw new Error(`Container "${config.container}" is not running`);
  await run(config.dockerBin, [
    'exec', config.container, 'pg_isready', '-U', config.dbUser, '-d', config.dbName, '-h', '127.0.0.1',
  ]);
}

export async function dumpTo(config, finalPath) {
  const partial = `${finalPath}.partial`;
  const shell = [
    'exec', config.container, 'sh', '-c',
    'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump -U "$0" -d "$1" -h 127.0.0.1 -Fc --no-owner --no-privileges',
    config.dbUser, config.dbName,
  ];

  const out = fs.createWriteStream(partial, { mode: 0o600 });
  const p = spawn(config.dockerBin, shell, { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => (err += d));
  const timer = setTimeout(() => p.kill('SIGKILL'), config.timeoutMs);
  const exited = new Promise((resolve, reject) => {
    p.on('error', (e) => reject(new Error(`Cannot run "${config.dockerBin}": ${e.message}`)));
    p.on('close', (code, sig) => resolve({ code, sig }));
  });
  try {
    await pipeline(p.stdout, out);
    const { code, sig } = await exited;
    if (sig === 'SIGKILL') throw new Error(`pg_dump exceeded ${config.timeoutMs / 60000} minutes and was killed`);
    if (code !== 0) throw new Error(`pg_dump exited ${code}: ${err.trim().slice(-800)}`);
  } catch (e) {
    fs.rmSync(partial, { force: true });
    throw e;
  } finally {
    clearTimeout(timer);
  }
  fs.renameSync(partial, finalPath);
}

export async function verifyDump(config, file) {
  const st = fs.statSync(file);
  if (st.size === 0) throw new Error('Backup file is empty');
  if (st.size < 1024) throw new Error(`Backup file is suspiciously small (${st.size} bytes)`);
  // Structural check: pg_restore must be able to read the table of contents.
  const toc = await new Promise((resolve, reject) => {
    const p = spawn(config.dockerBin, ['exec', '-i', config.container, 'pg_restore', '--list'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let o = '';
    let e = '';
    p.stdout.on('data', (d) => (o += d));
    p.stderr.on('data', (d) => (e += d));
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve(o) : reject(new Error(`pg_restore --list failed: ${e.trim().slice(-400)}`))));
    fs.createReadStream(file).on('error', reject).pipe(p.stdin);
  });
  if (!/TABLE DATA/.test(toc)) throw new Error('Backup contains no table data');
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  const sha = hash.digest('hex');
  fs.writeFileSync(`${file}.sha256`, `${sha}  ${path.basename(file)}\n`, { mode: 0o600 });
  return { size: st.size, sha };
}

export function prune(dir, { retentionDays, minKeep }, now = Date.now()) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => NAME_RE.test(f))
    .sort(); // timestamps sort lexicographically
  const removed = [];
  const cutoff = now - retentionDays * 86_400_000;
  const candidates = files.slice(0, Math.max(0, files.length - minKeep));
  for (const f of candidates) {
    const m = NAME_RE.exec(f)[1];
    const t = Date.parse(`${m.slice(0, 4)}-${m.slice(4, 6)}-${m.slice(6, 8)}T${m.slice(9, 11)}:${m.slice(11, 13)}:${m.slice(13, 15)}Z`);
    if (t < cutoff) {
      fs.rmSync(path.join(dir, f), { force: true });
      fs.rmSync(path.join(dir, `${f}.sha256`), { force: true });
      removed.push(f);
    }
  }
  // Orphaned partial files from crashed runs
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.partial')) {
      const full = path.join(dir, f);
      if (now - fs.statSync(full).mtimeMs > 86_400_000) fs.rmSync(full, { force: true });
    }
  }
  return removed;
}

async function alert(config, step, error) {
  const host = os.hostname();
  const subject = `[Wiki backup FAILED] ${host}: ${step}`;
  const text = [
    `The Wiki.js database backup failed on ${host}.`,
    '',
    `Time:  ${new Date().toISOString()}`,
    `Step:  ${step}`,
    `Error: ${error.message}`,
    '',
    `Backup folder: ${config.backupDir}`,
    `Logs:          journalctl -u wikijs-backup.service -n 100`,
    '',
    'Fix the cause, then run: systemctl start wikijs-backup.service',
  ].join('\n');
  await sendMail(config, subject, text);
}

export async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  const testFailure = argv.includes('--test-failure');
  const envIdx = argv.indexOf('--env');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envPath = envIdx >= 0 ? argv[envIdx + 1] : path.resolve(here, '..', '..', '.env');

  const env = loadEnv(envPath);
  const { config, problems } = buildConfig(env);
  if (problems.length) {
    console.error('Configuration problems:\n - ' + problems.join('\n - '));
    // Alert is only possible when mail settings are complete.
    if (config.smtp.host && config.alertTo && config.from && !/CHANGE_ME/.test(config.smtp.host + config.alertTo)) {
      try {
        await alert(config, 'configuration', new Error(problems.join('; ')));
      } catch (e) {
        console.error(`Alert email also failed: ${e.message}`);
      }
    }
    return 2;
  }

  let step = 'start';
  try {
    if (testFailure) {
      step = 'test-failure';
      throw new Error('Deliberate test failure (--test-failure). If this email arrived, alerting works.');
    }

    step = 'container check';
    log(`Checking container ${config.container}`);
    await checkContainer(config);

    step = 'backup folder';
    fs.mkdirSync(config.backupDir, { recursive: true, mode: 0o700 });
    fs.accessSync(config.backupDir, fs.constants.W_OK);

    if (dryRun) {
      log(`Dry run OK: container reachable, ${config.backupDir} writable, retention ${config.retentionDays} days (keep at least ${config.minKeep}). Nothing written.`);
      return 0;
    }

    const file = path.join(config.backupDir, `${PREFIX}${timestamp()}${SUFFIX}`);
    step = 'pg_dump';
    log(`Dumping ${config.dbName} to ${file}`);
    await dumpTo(config, file);

    step = 'verification';
    const { size, sha } = await verifyDump(config, file);
    log(`Verified ${size} bytes, sha256 ${sha.slice(0, 16)}...`);

    step = 'pruning';
    const removed = prune(config.backupDir, config);
    if (removed.length) log(`Pruned ${removed.length} old backup(s): ${removed.join(', ')}`);

    if (config.notifySuccess) {
      step = 'success notice';
      await sendMail(config, `[Wiki backup OK] ${os.hostname()}`, `Backup ${path.basename(file)} (${size} bytes) completed.`);
    }
    log('Backup finished');
    return 0;
  } catch (e) {
    console.error(`[${new Date().toISOString()}] FAILED at "${step}": ${e.message}`);
    try {
      await alert(config, step, e);
      log(`Alert email sent to ${config.alertTo}`);
    } catch (mailErr) {
      console.error(`Alert email could not be sent: ${mailErr.message}`);
    }
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c));
}
