import fs from 'node:fs';
import path from 'node:path';

// Minimal .env reader (KEY=VALUE, optional quotes, # comments).
// Real environment variables win over the file.
export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    } else {
      val = val.replace(/\s+#.*$/, '');
    }
    out[key] = val;
  }
  return out;
}

export function loadEnv(envPath) {
  let fileVars = {};
  if (envPath && fs.existsSync(envPath)) {
    fileVars = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
  }
  return { ...fileVars, ...process.env };
}

const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v));
const int = (v, d) => {
  if (v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isInteger(n) ? n : NaN;
};

// Returns { config, problems }. Problems are human-readable strings.
export function buildConfig(env) {
  const problems = [];
  const need = (k) => {
    const v = env[k];
    if (!v || /CHANGE_ME/i.test(v)) problems.push(`${k} is missing or still a placeholder`);
    return v;
  };

  const config = {
    backupDir: env.BACKUP_DIR || '/opt/ClosetRepublicArchive/backups',
    retentionDays: int(env.BACKUP_RETENTION_DAYS, 14),
    minKeep: int(env.BACKUP_MIN_KEEP, 3),
    container: env.BACKUP_DB_CONTAINER || 'wikijs-db',
    timeoutMs: int(env.BACKUP_TIMEOUT_MINUTES, 30) * 60_000,
    notifySuccess: bool(env.BACKUP_NOTIFY_SUCCESS, false),
    dockerBin: env.BACKUP_DOCKER_BIN || 'docker',
    dbName: need('DB_NAME'),
    dbUser: need('DB_USER'),
    smtp: {
      host: need('SMTP_HOST'),
      port: int(env.SMTP_PORT, 587),
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      requireTLS: bool(env.SMTP_REQUIRE_TLS, true),
      // Test hook: plain connection to a local mock server.
      insecure: bool(env.SMTP_INSECURE_FOR_TESTS, false),
    },
    from: env.MAIL_FROM,
    alertTo: need('BACKUP_ALERT_EMAIL'),
  };

  if (!config.from) problems.push('MAIL_FROM is missing');
  if (!Number.isInteger(config.retentionDays) || config.retentionDays < 1)
    problems.push('BACKUP_RETENTION_DAYS must be a whole number of at least 1');
  if (!Number.isInteger(config.minKeep) || config.minKeep < 1)
    problems.push('BACKUP_MIN_KEEP must be a whole number of at least 1');
  if (!Number.isInteger(config.smtp.port)) problems.push('SMTP_PORT must be a number');
  if (!Number.isFinite(config.timeoutMs) || config.timeoutMs < 60_000)
    problems.push('BACKUP_TIMEOUT_MINUTES must be at least 1');
  if (!path.isAbsolute(config.backupDir)) problems.push('BACKUP_DIR must be an absolute path');
  if (config.alertTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.alertTo))
    problems.push('BACKUP_ALERT_EMAIL is not a valid email address');

  return { config, problems };
}
