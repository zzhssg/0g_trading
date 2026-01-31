import { describe, expect, it } from "vitest";
import { ethers } from "ethers";
import { buildStrategyRegistrationPayload } from "./strategyPayload";

describe("buildStrategyRegistrationPayload", () => {
  it("uses datasetVersion/evalWindow from form input, not JSON", () => {
    const strategyJson = JSON.stringify({
      verification: {
        datasetVersion: "json-v",
        evalWindow: "json-window",
        backtestLogHash: "0xabc",
      },
      logic: { type: "indicator-threshold" },
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
      logic: { rules: [{ if: "rsi < 30", then: "entry_long" }] },
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

  it("accepts explicit storageRoot and backtestLogHash", () => {
    const payload = buildStrategyRegistrationPayload({
      strategyName: "Form Strategy",
      strategyJson: "{\"logic\":{}}",
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

  it("derives codeHash from strategy code when provided", () => {
    const strategyCode = "function trade(data){ return 1; }";
    const payload = buildStrategyRegistrationPayload({
      strategyName: "Code Strategy",
      strategyJson: "{\"logic\":{}}",
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
      strategyJson: "{\"logic\":{}}",
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
