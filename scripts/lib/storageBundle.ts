import { ethers } from "ethers";

type BundleInput = {
  strategy: Record<string, unknown>;
  params: Record<string, unknown>;
  backtestLog: string;
};

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function canonicalizeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }

  if (value && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => [key, canonicalizeJson(value[key])]);
    return Object.fromEntries(entries);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : value;
  }

  return value;
}

export function hashBacktestLog(log: string): string {
  const parsed = JSON.parse(log) as JsonValue;
  const canonical = JSON.stringify(canonicalizeJson(parsed));
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

export function buildStorageBundle(input: BundleInput) {
  return {
    strategy: input.strategy,
    params: input.params,
    backtestLog: input.backtestLog,
    backtestLogHash: hashBacktestLog(input.backtestLog),
    createdAt: new Date().toISOString(),
  };
}

export function buildUploadOutputs(input: {
  strategyRoot: string;
  logRoot: string;
  metadataRoot: string;
}) {
  return {
    storageRoot: input.strategyRoot,
    performancePointer: input.logRoot,
    tokenURI: input.metadataRoot,
  };
}

export function parseStorageArgs(argv: string[]) {
  const pick = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };

  const strategyPath = pick("--strategy");
  const paramsPath = pick("--params");
  const logPath = pick("--log");
  const outPath = pick("--out") ?? "storage-bundle.json";

  if (!strategyPath || !paramsPath || !logPath) {
    throw new Error("Missing required args: --strategy --params --log");
  }

  return { strategyPath, paramsPath, logPath, outPath };
}

export function parseFileUploadArgs(argv: string[]) {
  const pick = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const filePath = pick("--file");
  const outPath = pick("--out") ?? "upload-result.json";
  if (!filePath) {
    throw new Error("Missing required args: --file");
  }
  return { filePath, outPath };
}
