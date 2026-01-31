import { describe, expect, it } from "vitest";
import { ethers } from "ethers";
import { buildStrategyRegistrationPayload } from "./strategyPayload";

describe("buildStrategyRegistrationPayload", () => {
  const baseStrategy = {
    strategy: { name: "baseline" },
    instrument: { symbol: "BTC/USDT", timeframe: "1m", market: "perp" },
    logic: { type: "indicator-threshold", rules: [{ if: "x", then: "y" }] },
    execution: { position: "all-in", direction: "long+short" },
    verification: { backtestLogHash: "0xabc" },
  };

  it("uses datasetVersion/evalWindow from form input, not JSON", () => {
    const strategyJson = JSON.stringify({
      ...baseStrategy,
      verification: {
        datasetVersion: "json-v",
        evalWindow: "json-window",
        backtestLogHash: "0xabc",
      },
    });

    const payload = buildStrategyRegistrationPayload({
      strategyName: "Form Strategy",
      strategyJson,
      datasetVersion: "form-v1",
      evalWindow: "2025-01-01~2025-02-01",
    });

    expect(payload.datasetVersion).toBe("form-v1");
    expect(payload.evalWindow).toBe("2025-01-01~2025-02-01");

    const attributes = payload.metadata.attributes as Array<{
      trait_type: string;
      value: string;
    }>;
    const datasetAttr = attributes.find(
      (attr) => attr.trait_type === "Dataset Version"
    );
    const windowAttr = attributes.find(
      (attr) => attr.trait_type === "Eval Window"
    );

    expect(datasetAttr?.value).toBe("form-v1");
    expect(windowAttr?.value).toBe("2025-01-01~2025-02-01");
  });

  it("derives hashes from raw and normalized JSON", () => {
    const strategyJson = JSON.stringify({
      ...baseStrategy,
      logic: { type: "indicator-threshold", rules: [{ if: "rsi < 30", then: "entry_long" }] },
    });
    const payload = buildStrategyRegistrationPayload({
      strategyName: "Hash Strategy",
      strategyJson,
      datasetVersion: "v1",
      evalWindow: "window",
    });

    const expectedCodeHash = ethers.keccak256(
      ethers.toUtf8Bytes(strategyJson)
    );
    const normalized = JSON.stringify(JSON.parse(strategyJson));
    const expectedParamsHash = ethers.keccak256(
      ethers.toUtf8Bytes(normalized)
    );

    expect(payload.codeHash).toBe(expectedCodeHash);
    expect(payload.paramsHash).toBe(expectedParamsHash);
  });

  it("throws on invalid JSON", () => {
    expect(() =>
      buildStrategyRegistrationPayload({
        strategyName: "Bad",
        strategyJson: "{ invalid",
        datasetVersion: "v1",
        evalWindow: "window",
      })
    ).toThrow("策略 JSON 无法解析");
  });

  it("throws when required fields are missing or invalid", () => {
    const base = {
      strategy: { name: "ok" },
      instrument: { symbol: "BTC/USDT", timeframe: "1m", market: "perp" },
      logic: { type: "indicator-threshold", rules: [{ if: "x", then: "y" }] },
      execution: { position: "all-in", direction: "long+short" },
      verification: { backtestLogHash: "0x..." },
    };

    const cases: Array<{ value: Record<string, unknown>; message: string }> = [
      {
        value: { ...base, strategy: {} },
        message: "缺少 strategy.name",
      },
      {
        value: { ...base, instrument: { timeframe: "1m", market: "perp" } },
        message: "缺少 instrument.symbol",
      },
      {
        value: { ...base, logic: { type: "indicator-threshold", rules: {} } },
        message: "logic.rules 必须是数组",
      },
      {
        value: { ...base, verification: {} },
        message: "缺少 verification.backtestLogHash",
      },
    ];

    cases.forEach((testCase) => {
      expect(() =>
        buildStrategyRegistrationPayload({
          strategyName: "Bad Strategy",
          strategyJson: JSON.stringify(testCase.value),
          datasetVersion: "v1",
          evalWindow: "window",
        })
      ).toThrow(testCase.message);
    });
  });

  it("accepts explicit storageRoot and backtestLogHash", () => {
    const payload = buildStrategyRegistrationPayload({
      strategyName: "Form Strategy",
      strategyJson: JSON.stringify(baseStrategy),
      datasetVersion: "v1",
      evalWindow: "window",
      storageRoot: `0x${"11".repeat(32)}`,
      backtestLogHash: `0x${"22".repeat(32)}`,
    });

    expect(payload.storageRoot).toBe(`0x${"11".repeat(32)}`);
    const attributes = payload.metadata.attributes as Array<{
      trait_type: string;
      value: string;
    }>;
    const backtestAttr = attributes.find(
      (attr) => attr.trait_type === "Backtest Log Hash"
    );
    expect(backtestAttr?.value).toBe(`0x${"22".repeat(32)}`);
  });

  it("falls back to codeHash when storageRoot is blank", () => {
    const strategyJson = JSON.stringify(baseStrategy);
    const payload = buildStrategyRegistrationPayload({
      strategyName: "Form Strategy",
      strategyJson,
      datasetVersion: "v1",
      evalWindow: "window",
      storageRoot: "   ",
    });

    const expectedCodeHash = ethers.keccak256(
      ethers.toUtf8Bytes(strategyJson)
    );
    expect(payload.storageRoot).toBe(expectedCodeHash);
  });

  it("derives codeHash from strategy code when provided", () => {
    const strategyCode = "function trade(data){ return 1; }";
    const payload = buildStrategyRegistrationPayload({
      strategyName: "Code Strategy",
      strategyJson: JSON.stringify(baseStrategy),
      datasetVersion: "v1",
      evalWindow: "window",
      strategyCode,
      strategyCodeRoot: `0x${"aa".repeat(32)}`,
    });

    expect(payload.codeHash).toBe(
      ethers.keccak256(ethers.toUtf8Bytes(strategyCode))
    );
    expect(payload.storageRoot).toBe(`0x${"aa".repeat(32)}`);
  });

  it("accepts performancePointer and tokenURI", () => {
    const payload = buildStrategyRegistrationPayload({
      strategyName: "Form Strategy",
      strategyJson: JSON.stringify(baseStrategy),
      datasetVersion: "v1",
      evalWindow: "window",
      storageRoot: `0x${"11".repeat(32)}`,
      performancePointer: `0x${"22".repeat(32)}`,
      tokenURI: `0x${"33".repeat(32)}`,
    });

    expect(payload.performancePointer).toBe(`0x${"22".repeat(32)}`);
    expect(payload.tokenURI).toBe(`0x${"33".repeat(32)}`);
  });
});
