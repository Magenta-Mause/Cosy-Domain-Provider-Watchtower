import { chromium } from "playwright";

import { AdminClient, type AdminSubdomain, type ScanIngest } from "./admin-client.js";
import { scanSite } from "./agent.js";
import { SiteSession } from "./browser.js";
import { type Config, loadConfig } from "./config.js";
import { ScreenshotStorage } from "./storage.js";

function log(message: string, extra?: Record<string, unknown>): void {
  const line = { ts: new Date().toISOString(), message, ...extra };
  console.log(JSON.stringify(line));
}

async function scanOne(
  subdomain: AdminSubdomain,
  browser: import("playwright").Browser,
  storage: ScreenshotStorage,
  config: Config,
): Promise<ScanIngest> {
  const fqdn = subdomain.fqdn as string;
  const scannedAt = new Date();
  const session = new SiteSession(browser, fqdn, config);

  try {
    const verdict = await scanSite(session, fqdn, config);

    let screenshotKey: string | null = null;
    const screenshot = session.primaryScreenshot;
    if (screenshot) {
      screenshotKey = ScreenshotStorage.objectKey(subdomain.label, scannedAt);
      await storage.upload(screenshotKey, screenshot);
    }

    return {
      ...verdict,
      // The session is the authority on which paths were really opened; the model
      // occasionally reports ones it only intended to visit.
      visitedPaths: session.visitedPaths,
      subdomainUuid: subdomain.uuid,
      scannedAt: scannedAt.toISOString(),
      reachable: session.reachable,
      httpStatus: session.rootHttpStatus,
      screenshotKey,
      modelId: config.model,
    };
  } catch (error) {
    // A site that never answered is a normal outcome, not a scanner failure — record
    // it as UNREACHABLE so the dashboard shows the gap instead of stale data.
    if (!session.reachable) {
      return {
        subdomainUuid: subdomain.uuid,
        scannedAt: scannedAt.toISOString(),
        reachable: false,
        httpStatus: null,
        category: "UNREACHABLE",
        riskLevel: "NONE",
        summary: `Keine Antwort von ${fqdn} zum Scan-Zeitpunkt.`,
        visitedPaths: [],
        screenshotKey: null,
        modelId: config.model,
      };
    }
    throw error;
  } finally {
    await session.close();
  }
}

/** Runs `worker` over `items` with at most `limit` in flight at once. */
async function pooled<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function main(): Promise<void> {
  const config = loadConfig();
  const admin = new AdminClient(config);
  const storage = new ScreenshotStorage(config);

  const targets = await admin.listScanTargets();
  log("scan started", { targets: targets.length, model: config.model });

  const browser = await chromium.launch({ headless: true });
  let succeeded = 0;
  let failed = 0;

  try {
    await pooled(targets, config.concurrency, async (subdomain) => {
      try {
        const scan = await scanOne(subdomain, browser, storage, config);
        if (config.dryRun) {
          log("dry run verdict", { fqdn: subdomain.fqdn, scan });
        } else {
          await admin.ingestScan(scan);
        }
        succeeded++;
        log("scanned", {
          fqdn: subdomain.fqdn,
          category: scan.category,
          riskLevel: scan.riskLevel,
        });
      } catch (error) {
        failed++;
        log("scan failed", {
          fqdn: subdomain.fqdn,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  } finally {
    await browser.close();
  }

  log("scan finished", { succeeded, failed });

  // A run where every single subdomain failed is an infrastructure problem (bad
  // credentials, unreachable backend) and should show up as a failed CronJob rather
  // than as a quiet no-op.
  if (targets.length > 0 && succeeded === 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  log("fatal", { error: error instanceof Error ? error.stack : String(error) });
  process.exitCode = 1;
});
