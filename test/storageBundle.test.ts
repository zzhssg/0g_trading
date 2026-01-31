import { expect } from "chai";
import {
  buildStorageBundle,
  buildUploadOutputs,
  hashBacktestLog,
  parseStorageArgs,
} from "../scripts/lib/storageBundle";

describe("storage bundle", () => {
  it("hashes backtest log deterministically", () => {
    const log = JSON.stringify([{ side: "long", entryPrice: 100, exitPrice: 110 }]);
    const hash1 = hashBacktestLog(log);
    const hash2 = hashBacktestLog(log);
    expect(hash1).to.equal(hash2);
    expect(hash1).to.match(/^0x[0-9a-f]{64}$/);
  });

  it("canonicalizes JSON before hashing", () => {
    const log = JSON.stringify([{ side: "long", price: 1.2, ts: 1 }]);
    const shuffled = JSON.stringify([{ ts: 1, price: 1.2, side: "long" }]);
    expect(hashBacktestLog(log)).to.equal(hashBacktestLog(shuffled));
  });

  it("builds bundle with strategy/params/log", () => {
    const backtestLog = JSON.stringify([{ side: "short", entryPrice: 100 }]);
    const bundle = buildStorageBundle({
      strategy: { name: "s1" },
      params: { lookback: 20 },
      backtestLog,
    });
    expect(bundle.strategy.name).to.equal("s1");
    expect(bundle.params.lookback).to.equal(20);
    expect(bundle.backtestLog).to.equal(backtestLog);
    expect(bundle.backtestLogHash).to.match(/^0x[0-9a-f]{64}$/);
  });

  it("parses required storage args", () => {
    const args = parseStorageArgs([
      "--strategy",
      "strategy.json",
      "--params",
      "params.json",
      "--log",
      "backtest.log",
      "--out",
      "bundle.json",
    ]);

    expect(args.strategyPath).to.equal("strategy.json");
    expect(args.paramsPath).to.equal("params.json");
    expect(args.logPath).to.equal("backtest.log");
    expect(args.outPath).to.equal("bundle.json");
  });

  it("builds upload outputs with strategy/log roots", () => {
    const outputs = buildUploadOutputs({
      strategyRoot: "0xaaa",
      logRoot: "0xbbb",
      metadataRoot: "0xccc",
    });

    expect(outputs.storageRoot).to.equal("0xaaa");
    expect(outputs.performancePointer).to.equal("0xbbb");
    expect(outputs.tokenURI).to.equal("0xccc");
  });
});
