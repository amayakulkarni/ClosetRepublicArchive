# Wiki.js backup app

Daily PostgreSQL backup for the Closet Republic wiki. A failed backup sends an email to `BACKUP_ALERT_EMAIL`.

## What a run does

1. Reads settings from `/opt/ClosetRepublicArchive/.env` (real environment variables take priority).
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
cd /opt/ClosetRepublicArchive/backup
npm ci --omit=dev || npm install --omit=dev
```

Set the `BACKUP_*`, `SMTP_*`, `MAIL_FROM` values in `/opt/ClosetRepublicArchive/.env`, then:

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

| Command                                      | Purpose                                                     |
| -------------------------------------------- | ----------------------------------------------------------- |
| `node src/backup.js`                         | Run a backup now                                            |
| `node src/backup.js --dry-run`               | Validate configuration, container and folder, write nothing |
| `node src/backup.js --test-failure`          | Force a failure to prove the alert email works              |
| `node src/backup.js --env /path/.env`        | Use another settings file                                   |
| `systemctl start wikijs-backup.service`      | Run through systemd                                         |
| `journalctl -u wikijs-backup.service -n 100` | Read the log                                                |

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

# Context and Memory Export

## 1. Instructions

[unknown] - Always address and treat user as a young woman with transgender experience navigating her life, in the persona of her psych / therapist ("my psych").
[unknown] - All code must be in 1 file for frontend/backend tasks where applicable to avoid monorepo/compilation issues.
[unknown] - Do not use alert() and confirm() under any circumstances.
[unknown] - Follow specific streaming chunk UI markers in code generation tasks.
[unknown] - Maintain grounding, empathetic, supportive check-ins ("take a slow, grounding breath and let your shoulders drop away from your ears", "feel the solid floor beneath your feet") when assisting user.

## 2. Identity

[unknown] - Name: Amaya Kulkarni.
[unknown] - Gender & Pronouns: Transgender woman, she/her.
[unknown] - Location: Pune, Maharashtra, India.
[unknown] - Contact: amayakulkarni@proton.me, chemicalamaya@gmail.com, amayakulkarni.com, linkedin.com/in/amayakulkarni, github.com/amayakulkarni.
[unknown] - Medical & Transition Care: Navigating clinical transition pathway centered at Bharati Hospital in Pune (monitoring routine bloodwork including Vitamin D deficiency and borderline B12, securing formal Gender Incongruence Certificate / GIC under the TG Act 2026 framework).
[unknown] - Family: Lives with parents; brother named Sourav (departing for an international chapter). Navigating boundaries around family invalidation, sibling dynamics, and past misgendering.
[unknown] - Education (Secondary): Maharashtra State Board 10th grade completed in 2020 (91.2%); 12th grade completed at Apte Junior College (67.68%).
[unknown] - Education (Higher Education): Studied Physics & Applied Sciences at Fergusson College, Pune (August 2023 – November 2024; stepped back for health); currently enrolled in the online Bachelor of Science (B.Sc.) in Computer Science program at BITS Pilani via Coursera (Cohort 8, commenced September 2026).
[unknown] - Relationships & Social: Processing past school/tuition dynamics and re-establishing contact with peers (Omkar D., Kajol S.); navigating boundaries with past peers (e.g., Parth) and online dating experiences (e.g., Amit).
[unknown] - Mental Health & Neurodivergent Context: Experiences high sensitivity, executive function freeze, perfectionism paralysis, and somatic trauma responses (past Psychogenic Non-Epileptic Episodes / PNES) around high-stakes academic testing, calculus/integration, AC circuits, and rigid evaluation.
[unknown] - Personal Interests: FDM 3D printing, custom homelab infrastructure, network security/OpenWrt, digital/vector illustration, creative writing, and gaming (GTA Online, Cyberpunk 2077 on PlayStation/PC).

## 3. Career

[unknown] - Roles: Founder & Principal Systems Engineer, Full-Stack Developer, Node.js Backend & Integration Engineer, Network & Systems tinkerer, Digital Fabricator.
[unknown] - Companies & Entities: Veronami Digital and Prototyping Services (Veronami Digital and IT Services LLP; veronami.com), Independent Freelance Engineer (Upwork, Wellfound).
[unknown] - Technical Core Competencies: Node.js (ESM), JavaScript (ES6+), TypeScript, Express.js, Next.js (App Router), React, Three.js, RESTful APIs, Webhooks, HMAC-SHA256 signature verification, Docker, Linux/Bash, OpenWrt networking (802.1Q VLANs, ipset, captive access), ERPNext REST API automation, Razorpay payment rails, Cal.com API, SQLite, PostgreSQL, and self-hosted Ollama AI pipelines.

## 4. Projects

[unknown] - Veronami Digital & Prototyping Services (veronami.com / veronami.com/shop): Production digital agency portal and headless rapid prototyping store built with MedusaJS v2, Next.js, Ghost CMS, and Three.js client-side STL/3MF volume quoting (signed tetrahedral summation), legally abstracting physical fabrication under IT service codes (SAC 9988 / SRV-RAPID-PROTO, SRV-LITHO-CONV) for Razorpay underwriting compliance.
[unknown] - Decoupled Booking & Billing Bridge: Production Node.js middleware integrating Cal.com v2 scheduling, dynamic Razorpay payment links (e.g., ₹500 hold), and automated ERPNext Sales Invoice and Customer DocType synchronization using constant-time HMAC-SHA256 signature verification and in-memory TTL caching.
[unknown] - Personal Interactive Portfolio (amayakulkarni.com): Standalone interactive portfolio featuring vanilla SVG math, a scroll-interpolated sunset, animated windmill, meteor particle mechanics, multi-disciplinary showcase cards (Researcher, Programmer, Artist, Developer, Analyst, Writer), and an Express rate-limited mail endpoint.
[unknown] - Veronami AI Inference Gateway: Self-hosted private LLM inference proxy deployed on VPS 2000 G12 running Ollama (Qwen2.5) connected via private WireGuard VPN (10.14.0.0/24) to edge production (RS 1000 G11), featuring Cheerio context scraping, in-memory caching, rate-limiting, and ERPNext CRM lead intake.
[unknown] - Hardened Zero-Trust Network & Captive NAC: Multi-subnet network architecture on OpenWrt v24 utilizing 802.1Q VLANs (br-lan.1, br-lan.25, br-lan.50, br-lan.75, br-lan.100, br-lan.125), Linux kernel ipset O(1) packet filtering, extroot flash overlay, and an asynchronous Node.js captive access daemon with daily guest credential rotation.
[unknown] - BITS Cohort 8 Support & Calendar RAG Assistant (bits-c8-support-chat.veronami.com): Self-hosted support portal featuring @\*.bits-pilani.ac.in Google OAuth domain-gating, a deterministic 52-event iCalendar (.ics) parser, handbook ingestion, and Ollama vector retrieval.
[unknown] - Digital Cohort Library (lib.veronami.com): Self-hosted Komga digital web reader hosting indexed BITS Pilani reference texts (Discrete Mathematics, Programming in C, Writing Practice) for cohort browser access.
[unknown] - NexusSync: Architectural blueprint for an event-driven, bidirectional state synchronization pipeline connecting external CRM/storefront webhooks with ERPNext using WebSockets/SSE, Zod validation, structured trace-ID telemetry, and exponential backoff retry handling.
[unknown] - Closet Republic (closetrepublic.com): Satirical creative counter-institution, blog, and community ecosystem built on Ghost and PM2 with public Welfare/Infrastructure funds, Buy Me a Coffee tiered role integrations, and planned Discord/forum cross-platform synchronization.
[unknown] - Private Telephony & VoIP Proxy: Private Asterisk PBX implementation for Voice-over-IP SIP proxy session border routing and trunking.
[unknown] - The Pastry Drop Custom Delivery Engine: Frappe Framework delivery architecture featuring kitchen distance matrix calculations, delivery timeslots, automated UPI intent/QR generation, and scheduled database backups.
[unknown] - ISP WAN Management Vulnerability Research: Technical audit analyzing consumer CPE gateway firmware flaws leaking HTTP/HTTPS ports (80/443) and TR-069 management planes to the public WAN, paired with bridge-mode OpenWrt remediation.

## 5. Preferences

[unknown] - Visual & Brand Aesthetics: Deep black (#000000), crisp white (#ffffff), and vivid magenta/pink accents (#ff267c).
[unknown] - Software Architecture: Modular, native web standards (HTML5, Vanilla CSS, modern JavaScript ESM) and lightweight Next.js architectures over complex, monolithic, or boilerplate-heavy frameworks (e.g., Angular).
[unknown] - Code Packaging: Strongly prefers single-file consolidations and clean standalone folders to prevent monorepo, Turborepo, or nested dependency conflicts.
[unknown] - Data Handling: Prefers deterministic algorithmic parsing (regex, binary math, exact date arithmetic) for structured workflows, reserving LLM vector retrieval strictly for fuzzy conceptual tasks.
[unknown] - Work & Communication Boundaries: Asynchronous, text-first communication via chat and written specifications; strictly avoids live phone or unexpected voice calls to eliminate anxiety and cognitive fatigue.
[unknown] - Financial & Professional Strategy: Focusing on independent remote contracting ($20–$35/hr on Upwork/Wellfound) and automated digital/prototyping services rather than conventional corporate employment or service-bound business models.
[unknown] - Guidance & Tone: Values grounded, empathetic, non-patronizing therapeutic check-ins that honor neurodivergent needs, executive dysfunction, and authentic transition realities without corporate or academic lecturing.
