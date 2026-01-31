import { expect } from "chai";
import { parseSubmitResultArgs } from "../scripts/submit-result";

describe("submit-result args", function () {
  it("throws when required fields are missing", function () {
    expect(() => parseSubmitResultArgs(["--strategyId", "1"])).to.throw(
      "missing required"
    );
  });

  it("throws when hash is invalid", function () {
    expect(() =>
      parseSubmitResultArgs([
        "--strategyId",
        "1",
        "--pnl",
        "100",
        "--totalTrades",
        "10",
        "--winningTrades",
        "6",
        "--backtestLogRoot",
        "0x123",
        "--executionLogHash",
        "0x456",
      ])
    ).to.throw("invalid hash");
  });

  it("parses valid args", function () {
    const args = parseSubmitResultArgs([
      "--strategyId",
      "1",
      "--pnl",
      "100",
      "--totalTrades",
      "10",
      "--winningTrades",
      "6",
      "--backtestLogRoot",
      `0x${"11".repeat(32)}`,
      "--executionLogHash",
      `0x${"22".repeat(32)}`,
    ]);

    expect(args.strategyId).to.equal(1n);
    expect(args.pnl).to.equal(100n);
  });
});
