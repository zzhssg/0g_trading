import { describe, expect, it } from "vitest";
import { computePnlFromLog, hashLog } from "./verify";

describe("verify utils", () => {
  it("computes pnl from log entries", () => {
    const log = [{ entryPrice: 100, exitPrice: 110, side: "long", size: 1 }];
    expect(computePnlFromLog(log)).toBe(10);
  });

  it("hashes log deterministically", () => {
    const log = [{ side: "long", entryPrice: 100, exitPrice: 110, size: 1, ts: 1 }];
    const a = hashLog(log);
    const b = hashLog([
      { ts: 1, size: 1, exitPrice: 110, entryPrice: 100, side: "long" },
    ]);
    expect(a).toBe(b);
  });
});
