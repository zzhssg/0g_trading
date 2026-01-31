import fs from "node:fs";
import path from "node:path";
import { hashBacktestLog } from "./lib/storageBundle";

export type BacktestOptions = {
  marketPath: string;
  strategyPath: string;
  outLog?: string;
  outResult?: string;
  size?: number;
};

type MarketRow = {
  ts: string;
  open: number;
  close: number;
};

export async function runBacktest(options: Partial<BacktestOptions>) {
  const marketPath = options.marketPath;
  const strategyPath = options.strategyPath;
  if (!marketPath || !strategyPath) {
    throw new Error("missing required args: marketPath, strategyPath");
  }

  const outLog = options.outLog ?? path.resolve("./data/backtest.log");
  const outResult = options.outResult ?? path.resolve("./data/backtest-result.json");
  const size = options.size ?? 1;

  const marketRaw = fs.readFileSync(marketPath, "utf8");
  const strategyRaw = fs.readFileSync(strategyPath, "utf8");
  JSON.parse(strategyRaw);

  const market = JSON.parse(marketRaw) as { rows?: MarketRow[] };
  if (!Array.isArray(market.rows) || market.rows.length === 0) {
    throw new Error("missing market rows");
  }

  const first = market.rows[0];
  const last = market.rows[market.rows.length - 1];
  if (!first || !last || !first.open || !last.close || !first.ts) {
    throw new Error("invalid market rows");
  }

  const entryPrice = Number(first.open);
  const exitPrice = Number(last.close);
  const pnlBps = Math.round(((exitPrice - entryPrice) / entryPrice) * 10000 * size);

  const logEntries = [
    {
      entryPrice,
      exitPrice,
      side: "long" as const,
      size,
      ts: first.ts,
    },
  ];

  const backtestLog = JSON.stringify(logEntries);
  const backtestLogHash = hashBacktestLog(backtestLog);

  fs.writeFileSync(outLog, backtestLog);
  fs.writeFileSync(
    outResult,
    JSON.stringify(
      {
        pnlBps,
        totalTrades: 1,
        winningTrades: pnlBps > 0 ? 1 : 0,
        backtestLogHash,
        marketMeta: { start: first.ts, end: last.ts },
      },
      null,
      2
    )
  );

  return { outLog, outResult, pnlBps, backtestLogHash };
}

function parseArgs(argv: string[]) {
  const pick = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const marketPath = pick("--market");
  const strategyPath = pick("--strategy");
  const outLog = pick("--outLog");
  const outResult = pick("--outResult");
  const size = pick("--size");

  return {
    marketPath,
    strategyPath,
    outLog,
    outResult,
    size: size ? Number(size) : undefined,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runBacktest(args);
  console.log("backtestLog:", result.outLog);
  console.log("backtestResult:", result.outResult);
  console.log("pnlBps:", result.pnlBps);
  console.log("backtestLogHash:", result.backtestLogHash);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
