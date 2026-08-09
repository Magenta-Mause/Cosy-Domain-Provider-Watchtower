import type { Browser, BrowserContext } from "playwright";

import type { Config } from "./config.js";

export interface PageObservation {
  path: string;
  httpStatus: number | null;
  title: string;
  /** Visible text, truncated — the agent gets the gist, not the whole DOM. */
  text: string;
  /** Same-origin paths found on the page, deduplicated. */
  links: string[];
  screenshot: Buffer;
}

const TEXT_LIMIT = 4000;
const LINK_LIMIT = 25;

/**
 * One browser context per subdomain. Contexts are isolated, so a scanned site can
 * never see cookies or storage from another one.
 */
export class SiteSession {
  private context: BrowserContext | null = null;
  private readonly visited: string[] = [];
  private firstScreenshot: Buffer | null = null;
  private firstStatus: number | null = null;
  private everReachable = false;

  constructor(
    private readonly browser: Browser,
    private readonly fqdn: string,
    private readonly config: Config,
  ) {}

  get visitedPaths(): string[] {
    return [...this.visited];
  }

  /** The root page screenshot — what the dashboard card shows. */
  get primaryScreenshot(): Buffer | null {
    return this.firstScreenshot;
  }

  get rootHttpStatus(): number | null {
    return this.firstStatus;
  }

  get reachable(): boolean {
    return this.everReachable;
  }

  get pageBudgetLeft(): number {
    return this.config.maxPages - this.visited.length;
  }

  private async ensureContext(): Promise<BrowserContext> {
    if (!this.context) {
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        // A scanned page must never be able to phone home with our identity, and
        // being explicit about the UA keeps sites from serving a bot-only variant.
        userAgent:
          "Mozilla/5.0 (compatible; CosyWatchtower/0.1; +https://cosy-hosting.net/watchtower)",
        ignoreHTTPSErrors: true,
        javaScriptEnabled: true,
      });
      this.context.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);
    }
    return this.context;
  }

  async open(path: string): Promise<PageObservation> {
    const normalised = path.startsWith("/") ? path : `/${path}`;
    const context = await this.ensureContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(`https://${this.fqdn}${normalised}`, {
        waitUntil: "domcontentloaded",
      });
      // Give client-rendered apps (COSY's own frontend among them) a moment to paint
      // before the screenshot, but never block the whole scan on a hanging request.
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});

      const httpStatus = response?.status() ?? null;
      const title = await page.title().catch(() => "");
      const rawText = await page
        .locator("body")
        .innerText()
        .catch(() => "");
      const links = await this.sameOriginPaths(page);
      const screenshot = await page.screenshot({ type: "png", fullPage: false });

      this.visited.push(normalised);
      this.everReachable = true;
      if (this.firstScreenshot === null) {
        this.firstScreenshot = screenshot;
        this.firstStatus = httpStatus;
      }

      return {
        path: normalised,
        httpStatus,
        title,
        text: rawText.slice(0, TEXT_LIMIT),
        links,
        screenshot,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  private async sameOriginPaths(page: import("playwright").Page): Promise<string[]> {
    const hrefs = await page
      .locator("a[href]")
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).href))
      .catch(() => [] as string[]);

    const paths = new Set<string>();
    for (const href of hrefs) {
      try {
        const url = new URL(href);
        if (url.hostname !== this.fqdn) continue;
        paths.add(url.pathname);
        if (paths.size >= LINK_LIMIT) break;
      } catch {
        // Ignore mailto:, javascript: and other non-navigable hrefs.
      }
    }
    return [...paths];
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    this.context = null;
  }
}
