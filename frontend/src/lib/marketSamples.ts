export type MarketScale = {
  price: number;
  volume: number;
};

export type MarketRow = {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketData = {
  schemaVersion: string;
  datasetVersion: string;
  evalWindow: string;
  scale: MarketScale;
  rows: MarketRow[];
};

export type CandleSeries = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const SCHEMA_VERSION = "market-json-v1";

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} 必须为字符串`);
  }
  return value;
}

function requirePositiveInt(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} 必须为正整数`);
  }
  return value;
}

export function parseMarketData(content: string): MarketData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(`市场数据 JSON 无法解析: ${message}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("市场数据格式无效");
  }

  const data = parsed as Record<string, unknown>;
  const schemaVersion = requireString(data.schemaVersion, "schemaVersion");
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`schemaVersion 无效: ${schemaVersion}`);
  }

  const datasetVersion = requireString(data.datasetVersion, "datasetVersion");
  const evalWindow = requireString(data.evalWindow, "evalWindow");

  if (!data.scale || typeof data.scale !== "object") {
    throw new Error("scale 必须为对象");
  }
  const scale = data.scale as Record<string, unknown>;
  const price = requirePositiveInt(scale.price, "scale.price");
  const volume = requirePositiveInt(scale.volume, "scale.volume");

  if (!Array.isArray(data.rows)) {
    throw new Error("rows 必须为数组");
  }

  return {
    schemaVersion,
    datasetVersion,
    evalWindow,
    scale: { price, volume },
    rows: data.rows as MarketRow[],
  };
}

function parseIsoToSeconds(value: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`ts 无法解析: ${value}`);
  }
  return Math.floor(ms / 1000);
}

export function toCandleSeries(data: MarketData): CandleSeries[] {
  return data.rows.map((row) => ({
    time: parseIsoToSeconds(row.ts),
    open: row.open / data.scale.price,
    high: row.high / data.scale.price,
    low: row.low / data.scale.price,
    close: row.close / data.scale.price,
  }));
}
