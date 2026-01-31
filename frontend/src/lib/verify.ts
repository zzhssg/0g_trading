import { ethers } from "ethers";

export type LogEntry = {
  entryPrice: number;
  exitPrice: number;
  side: "long" | "short";
  size: number;
  ts?: number;
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

export function computePnlFromLog(entries: LogEntry[]) {
  return entries.reduce((sum, entry) => {
    const diff = entry.exitPrice - entry.entryPrice;
    const signed = entry.side === "long" ? diff : -diff;
    return sum + signed * entry.size;
  }, 0);
}

export function hashLog(entries: LogEntry[]) {
  const canonical = JSON.stringify(canonicalizeJson(entries as JsonValue));
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}
