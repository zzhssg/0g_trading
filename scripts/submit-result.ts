import { ethers } from "hardhat";

const REQUIRED_FIELDS = [
  "strategyId",
  "pnl",
  "totalTrades",
  "winningTrades",
  "backtestLogRoot",
  "executionLogHash",
] as const;

type ParsedArgs = {
  strategyId: bigint;
  pnl: bigint;
  totalTrades: bigint;
  winningTrades: bigint;
  backtestLogRoot: string;
  executionLogHash: string;
  arenaAddress?: string;
};

export function parseSubmitResultArgs(argv: string[]): ParsedArgs {
  const values: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (key && value) {
      values[key] = value;
    }
  }

  const missing = REQUIRED_FIELDS.filter((key) => !values[key]);
  if (missing.length > 0) {
    throw new Error(`missing required: ${missing.join(", ")}`);
  }

  const backtestLogRoot = values.backtestLogRoot!;
  const executionLogHash = values.executionLogHash!;
  if (backtestLogRoot.length !== 66 || executionLogHash.length !== 66) {
    throw new Error("invalid hash length");
  }

  return {
    strategyId: BigInt(values.strategyId!),
    pnl: BigInt(values.pnl!),
    totalTrades: BigInt(values.totalTrades!),
    winningTrades: BigInt(values.winningTrades!),
    backtestLogRoot,
    executionLogHash,
    arenaAddress: values.arena,
  };
}

async function main() {
  const args = parseSubmitResultArgs(process.argv.slice(2));
  const [signer] = await ethers.getSigners();
  if (!signer) {
    throw new Error("No signer available. Check PRIVATE_KEY in .env/siyao.");
  }

  const arenaAddress =
    args.arenaAddress ?? process.env.TRADING_ARENA_ADDRESS ?? "";
  if (!arenaAddress) {
    throw new Error("Missing TRADING_ARENA_ADDRESS");
  }

  const arena = await ethers.getContractAt("TradingArena", arenaAddress, signer);
  const tx = await arena.submitResult(
    args.strategyId,
    args.pnl,
    args.totalTrades,
    args.winningTrades,
    args.backtestLogRoot,
    args.executionLogHash
  );
  const receipt = await tx.wait();
  console.log("submitResult tx:", receipt?.hash ?? tx.hash);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
