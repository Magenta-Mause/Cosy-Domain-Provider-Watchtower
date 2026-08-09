import type { Config } from "./config.js";
import type { Verdict } from "./verdict.js";

export interface AdminSubdomain {
  uuid: string;
  label: string;
  fqdn: string | null;
  status: "PENDING" | "ACTIVE" | "FAILED";
}

export interface ScanIngest extends Omit<Verdict, "category"> {
  /**
   * Wider than the model's own enum: UNREACHABLE is set by the runner from the HTTP
   * exchange, never chosen by the agent.
   */
  category: Verdict["category"] | "UNREACHABLE";
  subdomainUuid: string;
  scannedAt: string;
  reachable: boolean;
  httpStatus: number | null;
  screenshotKey: string | null;
  modelId: string;
}

export class AdminClient {
  constructor(private readonly config: Config) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.config.adminApiUrl}/api/v1/admin${path}`, {
      ...init,
      headers: {
        "X-Admin-Key": this.config.adminKey,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Admin API ${init?.method ?? "GET"} ${path} failed: ${response.status} ${body}`,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /**
   * Only ACTIVE subdomains are worth scanning — PENDING ones have no DNS record yet
   * and FAILED ones never got provisioned, so both would just time out.
   */
  async listScanTargets(): Promise<AdminSubdomain[]> {
    const all = await this.request<AdminSubdomain[]>("/subdomains");
    return all.filter((s) => s.status === "ACTIVE" && s.fqdn);
  }

  async ingestScan(scan: ScanIngest): Promise<void> {
    await this.request("/watchtower/scans", {
      method: "POST",
      body: JSON.stringify(scan),
    });
  }
}
