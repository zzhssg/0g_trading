import fs from "node:fs";
import path from "node:path";
import { hashBacktestLog } from "./lib/storageBundle";

type MarketRow = {
  ts: string;
  open: number;
  high?: number;
  low?: number;
  close: number;
  volume?: number;
};

type MarketData = {
  rows?: MarketRow[];
  datasetVersion?: string;
  evalWindow?: string;
  scale?: { price?: number; volume?: number };
};

type BacktestLogEntry = {
  entryPrice: number;
  exitPrice: number;
  side: "long" | "short";
  size: number;
  ts?: string;
};

type BacktestResult = {
  pnlBps: number;
  totalTrades: number;
  winningTrades: number;
  backtestLogHash: string;
  marketMeta: {
    datasetVersion?: string;
    evalWindow?: string;
    scale?: { price?: number; volume?: number };
  };
};

type BacktestRunArgs = {
  marketPath: string;
  strategyPath: string;
  outLogPath: string;
  outResultPath: string;
  size: number;
};

export function parseBacktestRunArgs(argv: string[]): BacktestRunArgs {
  const pick = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };

  const marketPath = pick("--market");
  const strategyPath = pick("--strategy");
  const outLogPath = pick("--outLog") ?? "./data/backtest.log";
  const outResultPath = pick("--outResult") ?? "./data/backtest-result.json";
  const sizeRaw = pick("--size") ?? "1";
  const size = Number(sizeRaw);

  if (!marketPath || !strategyPath) {
    throw new Error("Missing required args: --market --strategy");
  }
  if (!Number.isFinite(size)) {
    throw new Error("Invalid --size");
  }

  return { marketPath, strategyPath, outLogPath, outResultPath, size };
}

export function computeBacktestResult(market: MarketData, size: number) {
  if (!Array.isArray(market.rows) || market.rows.length === 0) {
    throw new Error("rows missing");
  }
  const first = market.rows[0];
  const last = market.rows[market.rows.length - 1];
  if (!first || !last || first.open == null || last.close == null || !first.ts) {
    throw new Error("rows missing fields");
  }

  const entryPrice = Number(first.open);
  const exitPrice = Number(last.close);
  const pnlBps = Math.round(
    ((exitPrice - entryPrice) / entryPrice) * 10000 * size
  );

  const logEntries: BacktestLogEntry[] = [
    {
      entryPrice,
      exitPrice,
      side: "long",
      size,
      ts: first.ts,
    },
  ];

  const backtestLogHash = hashBacktestLog(JSON.stringify(logEntries));

  const result: BacktestResult = {
    pnlBps,
    totalTrades: 1,
    winningTrades: pnlBps > 0 ? 1 : 0,
    backtestLogHash,
    marketMeta: {
      datasetVersion: market.datasetVersion,
      evalWindow: market.evalWindow,
      scale: market.scale,
    },
  };

  return { logEntries, result };
}

function main() {
  const args = parseBacktestRunArgs(process.argv.slice(2));
  const marketRaw = fs.readFileSync(args.marketPath, "utf8");
  fs.readFileSync(args.strategyPath, "utf8");
  const market = JSON.parse(marketRaw) as MarketData;

  const { logEntries, result } = computeBacktestResult(market, args.size);

  const logPath = path.resolve(args.outLogPath);
  const resultPath = path.resolve(args.outResultPath);
  fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2));
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

  console.log("backtestLogPath:", logPath);
  console.log("backtestResultPath:", resultPath);
  console.log("backtestLogHash:", result.backtestLogHash);
  console.log("pnlBps:", result.pnlBps);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
