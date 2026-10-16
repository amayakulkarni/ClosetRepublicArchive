# Wiki.js backup app

Daily PostgreSQL backup for the Closet Republic wiki. A failed backup sends an email to `BACKUP_ALERT_EMAIL`.

## What a run does

1. Reads settings from `/opt/wikijs/.env` (real environment variables take priority).
2. Checks that the database container is running and accepts connections.
3. Runs `pg_dump -Fc` inside the container (`docker exec`). The dump uses the same Postgres version as the server, needs no database port on the host, and is compressed by the custom format.
4. Writes `wikijs-YYYYMMDDTHHMMSSZ.dump` to `BACKUP_DIR` (mode 600) through a `.partial` file, so a crashed run never leaves a half-written backup under the final name.
5. Verifies the file: non-empty, readable by `pg_restore --list`, contains table data. Writes a `.sha256` file beside it.
6. Deletes dumps older than `BACKUP_RETENTION_DAYS`, always keeping the newest `BACKUP_MIN_KEEP`.
7. On any failure at any step, emails the alert address and exits non-zero (systemd marks the run as failed).

## Install on the server

Requires Node.js 18 or newer and Docker.

```bash
apt install -y nodejs npm        # Debian 13 ships Node 20
cd /opt/wikijs/backup
npm ci --omit=dev || npm install --omit=dev
```

Set the `BACKUP_*`, `SMTP_*`, `MAIL_FROM` values in `/opt/wikijs/.env`, then:

```bash
node src/backup.js --dry-run          # checks settings and container; writes nothing
node src/backup.js --test-failure     # sends a deliberate failure email
node src/backup.js                    # real backup
cp systemd/wikijs-backup.service systemd/wikijs-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wikijs-backup.timer
systemctl list-timers wikijs-backup.timer
```

The `--test-failure` email must arrive before the timer is relied on.

## Commands

| Command | Purpose |
| --- | --- |
| `node src/backup.js` | Run a backup now |
| `node src/backup.js --dry-run` | Validate configuration, container and folder, write nothing |
| `node src/backup.js --test-failure` | Force a failure to prove the alert email works |
| `node src/backup.js --env /path/.env` | Use another settings file |
| `systemctl start wikijs-backup.service` | Run through systemd |
| `journalctl -u wikijs-backup.service -n 100` | Read the log |

Exit codes: `0` success, `1` backup failed (email attempted), `2` invalid settings.

## Tests

```bash
npm install          # includes dev dependencies
npm test
```

Covers settings parsing, pruning, the failure email against a mock SMTP server, an unreachable SMTP server, and (when Docker is available) a real dump, verification and dry run against a throwaway Postgres container.

## Notes

- A backup on the same server does not protect against loss of the server. Copy `BACKUP_DIR` off the machine regularly (for example `rsync` or `rclone` to separate storage).
- Alerts report failures only. A timer that never fires sends no email; check `systemctl list-timers` after setup and occasionally afterwards.
