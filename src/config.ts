function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

function number(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  }
  return parsed;
}

export interface Config {
  readonly adminApiUrl: string;
  readonly adminKey: string;
  readonly s3: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKey: string;
    readonly secretKey: string;
  };
  readonly model: string;
  /** How many pages the agent may open per subdomain, root page included. */
  readonly maxPages: number;
  /** How many subdomains are scanned at once. Each one holds a browser context. */
  readonly concurrency: number;
  readonly navigationTimeoutMs: number;
  /** Skip the ingest POST and print verdicts instead. For local runs. */
  readonly dryRun: boolean;
}

export function loadConfig(): Config {
  // The Agent SDK spawns the Claude Code CLI, which authenticates from either an
  // API key or a subscription OAuth token (`claude setup-token`). We accept both so
  // the same image can run against a personal subscription while prototyping and
  // against a proper API key in production — only the secret changes.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    throw new Error("Missing credentials: set either ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN");
  }

  return {
    adminApiUrl: optional("COSY_ADMIN_API_URL", "http://cosy-domain-provider-backend:8080").replace(
      /\/+$/,
      "",
    ),
    adminKey: required("COSY_ADMIN_KEY"),
    s3: {
      endpoint: required("WATCHTOWER_S3_ENDPOINT"),
      region: optional("WATCHTOWER_S3_REGION", "us-east-1"),
      bucket: optional("WATCHTOWER_S3_BUCKET", "cosy-watchtower-screenshots"),
      accessKey: required("WATCHTOWER_S3_ACCESS_KEY"),
      secretKey: required("WATCHTOWER_S3_SECRET_KEY"),
    },
    model: optional("WATCHTOWER_MODEL", "claude-haiku-4-5-20251001"),
    maxPages: number("WATCHTOWER_MAX_PAGES", 5),
    concurrency: number("WATCHTOWER_CONCURRENCY", 3),
    navigationTimeoutMs: number("WATCHTOWER_NAV_TIMEOUT_MS", 20_000),
    dryRun: process.env.WATCHTOWER_DRY_RUN === "true",
  };
}
