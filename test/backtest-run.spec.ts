import { expect } from "chai";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runBacktest } from "../scripts/backtest-run";
import { hashBacktestLog } from "../scripts/lib/storageBundle";

describe("backtest-run", function () {
  it("generates backtest log and result", async function () {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "backtest-run-"));
    const marketPath = path.join(tempDir, "market.json");
    const strategyPath = path.join(tempDir, "strategy.json");
    const outLog = path.join(tempDir, "backtest.log");
    const outResult = path.join(tempDir, "backtest-result.json");

    fs.writeFileSync(
      marketPath,
      JSON.stringify({
        rows: [
          { ts: "2024-01-01T00:00:00Z", open: 100, close: 110 },
          { ts: "2024-01-01T00:05:00Z", open: 110, close: 120 },
        ],
      })
    );
    fs.writeFileSync(strategyPath, JSON.stringify({ strategy: { name: "demo" } }));

    await runBacktest({ marketPath, strategyPath, outLog, outResult, size: 1 });

    const log = fs.readFileSync(outLog, "utf8");
    const result = JSON.parse(fs.readFileSync(outResult, "utf8"));
    expect(JSON.parse(log)).to.have.length(1);
    expect(result.pnlBps).to.equal(2000);
    expect(result.backtestLogHash).to.equal(hashBacktestLog(log));
  });

  it("throws when rows missing", async function () {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "backtest-run-"));
    const marketPath = path.join(tempDir, "market.json");
    const strategyPath = path.join(tempDir, "strategy.json");

    fs.writeFileSync(marketPath, JSON.stringify({}));
    fs.writeFileSync(strategyPath, JSON.stringify({ strategy: { name: "demo" } }));

    await expect(runBacktest({ marketPath, strategyPath })).to.be.rejectedWith(
      "missing market rows"
    );
  });
});
