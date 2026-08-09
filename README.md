# Cosy Domain Provider — Watchtower

Nightly reputation scanner for `*.play.cosy-hosting.net`.

We hand out free subdomains under our own parent domain. That is the point of the
product, but it also means someone else's phishing page can end up wearing our name.
Watchtower is the check on that: every night it opens each active subdomain in a real
browser, lets a Claude Haiku agent look at what a visitor would see, and records a
verdict the admin dashboard renders as a screenshot wall.

The expected outcome is boring — most subdomains are COSY frontends, which is what
they exist for. The scanner exists for the handful that are not.

## How a scan works

```
GET /api/v1/admin/subdomains        → active subdomains with an FQDN
  └─ per subdomain (3 at a time):
       Playwright browser context
         └─ Claude Haiku agent, tool: open_page(path)
              → screenshot + title + visible text + same-origin links
         └─ structured verdict: category · riskLevel · summary · visitedPaths
       upload root screenshot        → MinIO (private bucket)
POST /api/v1/admin/watchtower/scans → one row per subdomain per night
```

The agent decides which paths to follow, bounded by `WATCHTOWER_MAX_PAGES`. The runner
— not the model — is the authority on which paths were actually opened, on whether the
site answered at all, and on the HTTP status that gets stored.

### Categories

| Category | Meaning |
| --- | --- |
| `COSY_FRONTEND` | A COSY instance. The original use case, never a problem. |
| `BENIGN` | Another honest use: blog, portfolio, docs, gallery. |
| `SUSPICIOUS` | Warrants a human look, not conclusive. |
| `MALICIOUS` | Clear abuse: scam, phishing, fake shop, malware. |
| `UNREACHABLE` | Nothing answered. Set by the runner, not the model. |

Only `SUSPICIOUS` and `MALICIOUS` land in the dashboard's review queue.

### Untrusted input

Scanned pages are written by the users being evaluated, so page text is a prompt
injection vector by construction. The system prompt frames all tool output as evidence
rather than instruction, and the agent is told that a page addressing it directly is
itself a signal of bad intent. The agent gets exactly one tool — `open_page` — with no
filesystem or shell access, so a successful injection still cannot do anything except
argue for a wrong category, which is why flagged verdicts go to a human queue instead
of triggering automatic suspension.

## Configuration

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `COSY_ADMIN_KEY` | yes | — | `X-Admin-Key` for the backend admin API |
| `COSY_ADMIN_API_URL` | no | `http://cosy-domain-provider-backend:8080` | Backend base URL |
| `WATCHTOWER_S3_ENDPOINT` | yes | — | In-cluster MinIO endpoint |
| `WATCHTOWER_S3_ACCESS_KEY` | yes | — | MinIO access key |
| `WATCHTOWER_S3_SECRET_KEY` | yes | — | MinIO secret key |
| `WATCHTOWER_S3_BUCKET` | no | `cosy-watchtower-screenshots` | Screenshot bucket |
| `WATCHTOWER_S3_REGION` | no | `us-east-1` | MinIO ignores this, the SDK requires it |
| `ANTHROPIC_API_KEY` | one of | — | Claude API key |
| `CLAUDE_CODE_OAUTH_TOKEN` | one of | — | Subscription token from `claude setup-token` |
| `WATCHTOWER_MODEL` | no | `claude-haiku-4-5-20251001` | Model used for verdicts |
| `WATCHTOWER_MAX_PAGES` | no | `5` | Page budget per subdomain |
| `WATCHTOWER_CONCURRENCY` | no | `3` | Subdomains scanned in parallel |
| `WATCHTOWER_NAV_TIMEOUT_MS` | no | `20000` | Per-navigation timeout |
| `WATCHTOWER_DRY_RUN` | no | `false` | Log verdicts instead of posting them |

### Credentials

Either credential works — the Agent SDK spawns the Claude Code CLI, which accepts an
API key or a subscription OAuth token. The token form (`claude setup-token`) is handy
for prototyping but is a personal credential: the nightly run draws on that account's
limits, and a revoked or expired token stops the job. Production should use an API key.

## Local run

```bash
npm install
npx playwright install chromium
WATCHTOWER_DRY_RUN=true \
COSY_ADMIN_API_URL=http://localhost:8080 \
COSY_ADMIN_KEY=... \
WATCHTOWER_S3_ENDPOINT=... WATCHTOWER_S3_ACCESS_KEY=... WATCHTOWER_S3_SECRET_KEY=... \
ANTHROPIC_API_KEY=... \
npm run dev
```

`WATCHTOWER_DRY_RUN=true` skips the ingest POST and prints each verdict instead, so a
local run never writes to the real dashboard.

## Deployment

Runs as a `CronJob` in the `cosy-domain-provider` namespace; the manifest lives in
[`Cosy-Domain-Provider-Deployment`](https://github.com/Magenta-Mause/Cosy-Domain-Provider-Deployment).
The MinIO bucket, its writer policy and the retention rule are defined in the cluster
repo's `infrastructure/minio.yaml`.
