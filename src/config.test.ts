import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

const REQUIRED_ENV = {
  COSY_ADMIN_KEY: "admin-key",
  WATCHTOWER_S3_ENDPOINT: "http://minio:9000",
  WATCHTOWER_S3_ACCESS_KEY: "access",
  WATCHTOWER_S3_SECRET_KEY: "secret",
  ANTHROPIC_API_KEY: "sk-test",
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("WATCHTOWER_") || key.startsWith("COSY_") || key.startsWith("ANTHROPIC_")) {
      delete process.env[key];
    }
  }
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  Object.assign(process.env, REQUIRED_ENV);
});

afterEach(() => {
  process.env = saved;
});

describe("loadConfig", () => {
  it("applies defaults for the optional knobs", () => {
    const config = loadConfig();
    expect(config.model).toBe("claude-haiku-4-5-20251001");
    expect(config.maxPages).toBe(5);
    expect(config.concurrency).toBe(3);
    expect(config.s3.bucket).toBe("cosy-watchtower-screenshots");
    expect(config.dryRun).toBe(false);
  });

  it("strips trailing slashes from the admin URL so paths do not double up", () => {
    process.env.COSY_ADMIN_API_URL = "https://api.cosy-hosting.net/";
    expect(loadConfig().adminApiUrl).toBe("https://api.cosy-hosting.net");
  });

  it("accepts a subscription token instead of an API key", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token";
    expect(() => loadConfig()).not.toThrow();
  });

  it("rejects a run with neither credential", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => loadConfig()).toThrow(/ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN/);
  });

  it("rejects a missing admin key", () => {
    delete process.env.COSY_ADMIN_KEY;
    expect(() => loadConfig()).toThrow(/COSY_ADMIN_KEY/);
  });

  it("rejects a non-numeric page budget", () => {
    process.env.WATCHTOWER_MAX_PAGES = "many";
    expect(() => loadConfig()).toThrow(/must be a number/);
  });
});
