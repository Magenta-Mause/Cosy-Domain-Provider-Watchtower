import { describe, expect, it } from "vitest";

import { ScreenshotStorage } from "./storage.js";

describe("ScreenshotStorage.objectKey", () => {
  it("groups screenshots by run date", () => {
    const key = ScreenshotStorage.objectKey("swift-gecko", new Date("2026-08-09T03:12:00Z"));
    expect(key).toBe("2026-08-09/swift-gecko.png");
  });

  it("is stable within a run so a rerun overwrites instead of piling up", () => {
    const first = ScreenshotStorage.objectKey("rich-crane", new Date("2026-08-09T03:12:00Z"));
    const second = ScreenshotStorage.objectKey("rich-crane", new Date("2026-08-09T04:55:00Z"));
    expect(first).toBe(second);
  });

  it("uses UTC so a run just after midnight does not straddle two prefixes", () => {
    const key = ScreenshotStorage.objectKey("wise-mole", new Date("2026-08-09T23:30:00Z"));
    expect(key.startsWith("2026-08-09/")).toBe(true);
  });
});
