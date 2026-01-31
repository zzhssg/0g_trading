import { ethers } from "ethers";

type MetadataAttribute = {
  trait_type: string;
  value: string;
};

export type StrategyRegistrationPayload = {
  codeHash: string;
  paramsHash: string;
  datasetVersion: string;
  evalWindow: string;
  storageRoot: string;
  performancePointer: string;
  metadata: {
    name: string;
    description: string;
    attributes: MetadataAttribute[];
  };
  tokenURI: string;
};

export type StrategyRegistrationInput = {
  strategyName: string;
  strategyJson: string;
  datasetVersion: string;
  evalWindow: string;
  storageRoot?: string;
  performancePointer?: string;
  backtestLogHash?: string;
  tokenURI?: string;
  strategyCode?: string;
  strategyCodeRoot?: string;
};

const DESCRIPTION = "AI Trading Strategy";

function encodeTokenURI(metadata: StrategyRegistrationPayload["metadata"]) {
  const json = JSON.stringify(metadata);
  const base64 =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa(json)
      : Buffer.from(json, "utf8").toString("base64");
  return `data:application/json;base64,${base64}`;
}

export function buildStrategyRegistrationPayload(
  input: StrategyRegistrationInput
): StrategyRegistrationPayload {
  const {
    strategyName,
    strategyJson,
    datasetVersion,
    evalWindow,
    storageRoot: providedStorageRoot,
    performancePointer: providedPerformancePointer,
    backtestLogHash: providedBacktestLogHash,
    tokenURI: providedTokenURI,
    strategyCode,
    strategyCodeRoot,
  } = input;
  let parsedStrategy: Record<string, unknown>;
  try {
    parsedStrategy = JSON.parse(strategyJson) as Record<string, unknown>;
  } catch {
    throw new Error("策略 JSON 无法解析，请检查格式。");
  }

  const normalizedJson = JSON.stringify(parsedStrategy);
  const codeHash = strategyCode
    ? ethers.keccak256(ethers.toUtf8Bytes(strategyCode))
    : ethers.keccak256(ethers.toUtf8Bytes(strategyJson));
  const paramsHash = ethers.keccak256(ethers.toUtf8Bytes(normalizedJson));
  const storageRoot = strategyCodeRoot ?? providedStorageRoot ?? codeHash;
  const performancePointer = providedPerformancePointer ?? "0x...";
  const verification = parsedStrategy.verification as
    | { backtestLogHash?: unknown }
    | undefined;
  const backtestLogHash =
    providedBacktestLogHash ??
    (typeof verification?.backtestLogHash === "string"
      ? verification.backtestLogHash
      : "0x...");

  const metadata = {
    name: strategyName,
    description: DESCRIPTION,
    attributes: [
      { trait_type: "Code Hash", value: codeHash },
      { trait_type: "Params Hash", value: paramsHash },
      { trait_type: "Dataset Version", value: datasetVersion },
      { trait_type: "Eval Window", value: evalWindow },
      { trait_type: "Backtest Log Hash", value: backtestLogHash },
      { trait_type: "Performance Pointer", value: performancePointer },
      { trait_type: "Created At", value: new Date().toISOString() },
    ],
  };

  return {
    codeHash,
    paramsHash,
    datasetVersion,
    evalWindow,
    storageRoot,
    performancePointer,
    metadata,
    tokenURI: providedTokenURI ?? encodeTokenURI(metadata),
  };
}
