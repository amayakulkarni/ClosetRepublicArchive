# Wiki.js runbook: wiki.closetrepublic.com

Stack: Wiki.js 2 and PostgreSQL 16 in Docker Compose, nginx on the host as the TLS reverse proxy, a Node.js backup app on a systemd timer.

```
Internet --443--> nginx (host) --> 127.0.0.1:40010 --> wikijs (container :3000) --wiki-net--> db (container :5432)
```

Only `127.0.0.1:40010` is published by Docker. Postgres has no published port.

**Port note.** The original request named both 40010 and 3400. Everything here uses **40010**, matching the server's port plan. To use 3400 instead, set `WIKI_PORT=3400` in `.env` and change `proxy_pass` in `nginx/wiki.conf` to `http://127.0.0.1:3400`.

All commands run as root on the server (hostname `veronami`, Debian 13).

---

## 1. Prerequisites

1. Create a DNS `A` record (and `AAAA` if IPv6 is used) for `wiki.closetrepublic.com` pointing at the server. Verify:
   ```bash
   dig +short wiki.closetrepublic.com
   ```
2. Confirm ports 80 and 443 are open in the firewall.
3. Confirm port 40010 is free:
   ```bash
   ss -ltn | grep ':40010' || echo free
   ```
4. Install Docker Engine and the Compose plugin from the official Docker repository for Debian (https://docs.docker.com/engine/install/debian/). Verify:
   ```bash
   docker --version
   docker compose version
   ```
5. Install certbot and Node.js (for the backup app):
   ```bash
   apt update
   apt install -y certbot nodejs npm openssl
   node --version      # 18 or newer
   ```

## 2. Create the folder and copy the package

```bash
mkdir -p /opt/wikijs
cd /opt/wikijs
```

Copy the package contents (`docker-compose.yml`, `.env.example`, `.gitignore`, `RUNBOOK.md`, `nginx/`, `backup/`) into `/opt/wikijs`, for example from the dev machine:

```bash
scp -r F:/ClosetRepublicDev/wiki/* root@veronami:/opt/wikijs/
```

Do not copy `backup/node_modules`; it is installed on the server in step 6.

## 3. Create `.env`

```bash
cd /opt/wikijs
cp .env.example .env
chmod 600 .env
```

Generate a strong database password and paste it as `DB_PASS`:

```bash
openssl rand -hex 32
```

Edit `.env` (`nano .env`) and set:

- `DB_PASS`: the generated value.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: the mail account used for alerts.
- `BACKUP_ALERT_EMAIL`: the address that receives backup failure emails.
- Leave `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `WIKI_PORT` as given unless there is a reason to change them.

Check that no placeholder remains:

```bash
grep CHANGE_ME .env && echo "STILL HAS PLACEHOLDERS" || echo ok
```

`DB_PASS` is read by Postgres only when the data volume is first created. Changing it later requires `ALTER USER` inside Postgres as well; editing `.env` alone breaks the connection.

## 4. Start the stack

```bash
cd /opt/wikijs
docker compose config --quiet && echo "compose file valid"
docker compose pull
docker compose up -d
docker compose ps
```

Wait until `db` shows `healthy` and `wikijs` shows `healthy` (the app takes up to about 90 seconds on first start while it creates tables). Follow the log if needed:

```bash
docker compose logs -f wikijs
```

Test locally:

```bash
curl -I http://127.0.0.1:40010/
```

A `200` or `302` response means the app is up.

## 5. nginx and the first certificate

The HTTPS server block refuses to load until the certificate files exist, so install an HTTP-only bootstrap site first.

1. Create the ACME webroot and install the bootstrap site:
   ```bash
   mkdir -p /var/www/certbot
   cp /opt/wikijs/nginx/wiki-bootstrap.conf /etc/nginx/sites-available/wiki.conf
   ln -sf /etc/nginx/sites-available/wiki.conf /etc/nginx/sites-enabled/wiki.conf
   nginx -t && systemctl reload nginx
   ```
2. Issue the certificate (replace the email):
   ```bash
   certbot certonly --webroot -w /var/www/certbot \
     -d wiki.closetrepublic.com \
     --email YOUR_EMAIL_HERE --agree-tos --no-eff-email
   ```
3. Replace the bootstrap with the real site and reload:
   ```bash
   cp /opt/wikijs/nginx/wiki.conf /etc/nginx/sites-available/wiki.conf
   nginx -t && systemctl reload nginx
   ```
4. Make renewals reload nginx:
   ```bash
   mkdir -p /etc/letsencrypt/renewal-hooks/deploy
   printf '#!/bin/sh\nsystemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
   chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
   certbot renew --dry-run
   systemctl list-timers | grep certbot
   ```
5. Verify:
   ```bash
   curl -I http://wiki.closetrepublic.com/     # expect 301 to https
   curl -I https://wiki.closetrepublic.com/    # expect 200 or 302
   ```

## 6. Onboarding wizard

1. Open https://wiki.closetrepublic.com in a browser. The setup page appears on first visit.
2. Enter the administrator email, a strong password (store it in a password manager) and the **Site URL** `https://wiki.closetrepublic.com` (no trailing slash).
3. Choose whether to share anonymous telemetry, then click **Install**.
4. Log in with the new administrator account.
5. In **Administration > Security**, consider disabling open registration (**Registration** under **Authentication > Local**) until user policy is decided.

Complete this step promptly; whoever opens the page first creates the administrator account.

## 7. Backups

Install and test the backup app (full details in `backup/README.md`):

```bash
cd /opt/wikijs/backup
npm install --omit=dev
node src/backup.js --dry-run
node src/backup.js --test-failure     # an email must arrive at BACKUP_ALERT_EMAIL
node src/backup.js                    # first real backup
ls -lh /opt/wikijs/backups

cp systemd/wikijs-backup.service systemd/wikijs-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now wikijs-backup.timer
systemctl list-timers wikijs-backup.timer
```

Copy `/opt/wikijs/backups` to storage outside this server on a schedule; backups on the same disk do not survive loss of the server.

Wiki pages, users, settings and uploaded assets are all stored in the database, so the dump covers everything except `.env` and the nginx and certificate files. Keep a copy of `.env` in a password manager.

---

## Restore

Restores replace the current database contents. Take a fresh backup first if the current state may still be needed.

1. Pick the dump and verify it:
   ```bash
   cd /opt/wikijs/backups
   ls -1 *.dump
   sha256sum -c wikijs-YYYYMMDDTHHMMSSZ.dump.sha256
   ```
2. Stop the application (leave the database running):
   ```bash
   cd /opt/wikijs
   docker compose stop wikijs
   ```
3. Restore:
   ```bash
   docker exec -i wikijs-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" -h 127.0.0.1 --clean --if-exists --no-owner --exit-on-error' \
     < /opt/wikijs/backups/wikijs-YYYYMMDDTHHMMSSZ.dump
   ```
4. Start the application and check it:
   ```bash
   docker compose start wikijs
   docker compose ps
   ```
5. Log in at https://wiki.closetrepublic.com and confirm that pages are present.

**Restoring onto a new server:** repeat sections 1 to 5, use the same `DB_PASS` from the saved `.env`, run `docker compose up -d db`, wait until healthy, run step 3 above, then `docker compose up -d`. The onboarding wizard does not reappear because the restored database already holds the configuration.

## Update Wiki.js

The `:2` tag follows the 2.x releases.

```bash
cd /opt/wikijs
node backup/src/backup.js                 # backup first
docker compose pull
docker compose up -d
docker compose ps
docker image prune -f
```

If the new version misbehaves, restore the pre-update dump as described above after pinning the previous image tag in `docker-compose.yml` (for example `ghcr.io/requarks/wiki:2.5`).

The Postgres image is pinned to major version 16. A major upgrade (16 to 17) needs a dump and restore into a new volume and is not covered here.

## Routine checks

```bash
docker compose ps                                 # both services healthy
docker compose logs --tail 50 wikijs
systemctl list-timers wikijs-backup.timer         # next run scheduled
journalctl -u wikijs-backup.service -n 50         # last backup result
certbot certificates                              # expiry date
df -h /opt/wikijs                                 # disk space
```

## Stop and remove

```bash
docker compose down            # stops and removes containers; data volume is kept
docker compose down -v         # also DELETES the database volume (irreversible)
```
