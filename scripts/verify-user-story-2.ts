import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { ethers as hardhatEthers } from "hardhat";
import { computeBacktestResult } from "./backtest-run";
import { hashBacktestLog } from "./lib/storageBundle";

type MarketRow = {
  ts: string;
  open: number;
  close: number;
  high?: number;
  low?: number;
  volume?: number;
};

type MarketData = {
  datasetVersion?: string;
  evalWindow?: string;
  scale?: { price?: number; volume?: number };
  rows?: MarketRow[];
};

type VerifyArgs = {
  marketPath: string;
  strategyPath: string;
  arenaAddress: string;
  nftAddress: string;
  outDir: string;
  size: number;
  marketRoot?: string;
  strategyRoot?: string;
  logRoot?: string;
};

type DatasetHashes = {
  datasetVersion: string;
  evalWindow: string;
  datasetVersionHash: string;
  evalWindowHash: string;
};

function requireString(pathName: string, value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing ${pathName}`);
  }
}

export function parseVerifyUserStoryArgs(argv: string[]): VerifyArgs {
  const pick = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };

  const marketPath = pick("--market");
  const strategyPath = pick("--strategy");
  const arenaAddress = pick("--arena");
  const nftAddress = pick("--nft");
  const marketRoot = pick("--market-root") ?? pick("--marketroot");
  const strategyRoot = pick("--strategy-root") ?? pick("--strategyroot");
  const logRoot = pick("--log-root") ?? pick("--logroot");
  const outDir =
    pick("--outdir") ?? pick("--out-dir") ?? pick("--outDir") ?? "./data/verify";
  const sizeRaw = pick("--size") ?? "1";
  const size = Number(sizeRaw);

  if (!marketPath || !strategyPath || !arenaAddress || !nftAddress) {
    throw new Error("Missing required args: --market --strategy --arena --nft");
  }
  if (!Number.isFinite(size)) {
    throw new Error("Invalid --size");
  }

  return {
    marketPath,
    strategyPath,
    arenaAddress,
    nftAddress,
    outDir,
    size,
    marketRoot,
    strategyRoot,
    logRoot,
  };
}

export function computeDatasetHashes(market: MarketData): DatasetHashes {
  requireString("datasetVersion", market.datasetVersion);
  requireString("evalWindow", market.evalWindow);

  const datasetVersion = market.datasetVersion!.trim();
  const evalWindow = market.evalWindow!.trim();
  return {
    datasetVersion,
    evalWindow,
    datasetVersionHash: ethers.keccak256(ethers.toUtf8Bytes(datasetVersion)),
    evalWindowHash: ethers.keccak256(ethers.toUtf8Bytes(evalWindow)),
  };
}

async function uploadFile(
  rpc: string,
  signer: ethers.Wallet,
  filePath: string,
  indexerUrl: string
) {
  const { Indexer, ZgFile } = await import("@0glabs/0g-ts-sdk");
  const indexer = new Indexer(indexerUrl);
  const file = await ZgFile.fromFilePath(filePath);
  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr) {
      throw treeErr;
    }
    const [tx, uploadErr] = await indexer.upload(file, rpc, signer);
    if (uploadErr) {
      throw uploadErr;
    }
    return {
      rootHash: tree.rootHash(),
      txHash: tx?.hash ?? null,
    };
  } finally {
    await file.close();
  }
}

function ensureRows(market: MarketData) {
  if (!Array.isArray(market.rows) || market.rows.length === 0) {
    throw new Error("rows missing");
  }
  const first = market.rows[0];
  const last = market.rows[market.rows.length - 1];
  if (!first?.ts || first.open == null || last.close == null) {
    throw new Error("rows missing fields");
  }
}

function buildTokenURI(input: {
  name: string;
  description: string;
  codeHash: string;
  paramsHash: string;
  datasetVersion: string;
  evalWindow: string;
  storageRoot: string;
  performancePointer: string;
  backtestLogHash: string;
}) {
  const metadata = {
    name: input.name,
    description: input.description,
    attributes: [
      { trait_type: "Code Hash", value: input.codeHash },
      { trait_type: "Params Hash", value: input.paramsHash },
      { trait_type: "Dataset Version", value: input.datasetVersion },
      { trait_type: "Eval Window", value: input.evalWindow },
      { trait_type: "Storage Root", value: input.storageRoot },
      { trait_type: "Performance Pointer", value: input.performancePointer },
      { trait_type: "Backtest Log Hash", value: input.backtestLogHash },
    ],
  };
  return `data:application/json;base64,${Buffer.from(
    JSON.stringify(metadata)
  ).toString("base64")}`;
}

async function main() {
  const args = parseVerifyUserStoryArgs(process.argv.slice(2));

  const rpc = process.env.RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const indexerUrl =
    process.env.INDEXER_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing PRIVATE_KEY in env");
  }

  const marketRaw = fs.readFileSync(args.marketPath, "utf8");
  const strategyRaw = fs.readFileSync(args.strategyPath, "utf8");
  const market = JSON.parse(marketRaw) as MarketData;
  const strategy = JSON.parse(strategyRaw) as Record<string, unknown>;

  ensureRows(market);
  const datasetHashes = computeDatasetHashes(market);

  const normalizedStrategy = JSON.stringify(strategy);
  const codeHash = ethers.keccak256(ethers.toUtf8Bytes(strategyRaw));
  const paramsHash = ethers.keccak256(ethers.toUtf8Bytes(normalizedStrategy));

  const { logEntries, result } = computeBacktestResult(market, args.size);
  const backtestLogHash = hashBacktestLog(JSON.stringify(logEntries));
  if (backtestLogHash !== result.backtestLogHash) {
    throw new Error("backtestLogHash mismatch");
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  const logPath = path.resolve(args.outDir, "backtest.log");
  const resultPath = path.resolve(args.outDir, "backtest-result.json");
  fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2));
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2));

  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(privateKey, provider);

  const marketUpload = args.marketRoot
    ? { rootHash: args.marketRoot, txHash: null }
    : await uploadFile(rpc, signer, args.marketPath, indexerUrl);
  const strategyUpload = args.strategyRoot
    ? { rootHash: args.strategyRoot, txHash: null }
    : await uploadFile(rpc, signer, args.strategyPath, indexerUrl);
  const logUpload = args.logRoot
    ? { rootHash: args.logRoot, txHash: null }
    : await uploadFile(rpc, signer, logPath, indexerUrl);

  const [chainSigner] = await hardhatEthers.getSigners();
  if (!chainSigner) {
    throw new Error("No signer available. Check PRIVATE_KEY in .env/siyao.");
  }

  const strategyNFT = await hardhatEthers.getContractAt(
    "StrategyNFT",
    args.nftAddress,
    chainSigner
  );
  const tradingArena = await hardhatEthers.getContractAt(
    "TradingArena",
    args.arenaAddress,
    chainSigner
  );

  const startTx = await tradingArena.startNewRound(
    marketUpload.rootHash,
    datasetHashes.datasetVersionHash,
    datasetHashes.evalWindowHash
  );
  await startTx.wait();
  const roundId = await tradingArena.currentRound();

  const tokenURI = buildTokenURI({
    name: "UserStory2-Strategy",
    description: "User Story 2 verification",
    codeHash,
    paramsHash,
    datasetVersion: datasetHashes.datasetVersion,
    evalWindow: datasetHashes.evalWindow,
    storageRoot: strategyUpload.rootHash,
    performancePointer: logUpload.rootHash,
    backtestLogHash,
  });

  const mintTx = await strategyNFT.registerStrategy(
    codeHash,
    paramsHash,
    datasetHashes.datasetVersion,
    datasetHashes.evalWindow,
    strategyUpload.rootHash,
    logUpload.rootHash,
    tokenURI
  );
  const mintReceipt = await mintTx.wait();

  let tokenId: bigint | null = null;
  for (const log of mintReceipt?.logs ?? []) {
    try {
      const parsed = strategyNFT.interface.parseLog(log);
      if (parsed?.name === "StrategyRegistered") {
        tokenId = parsed.args[0] as bigint;
        break;
      }
    } catch {
      // ignore
    }
  }

  if (tokenId === null) {
    throw new Error("Failed to parse StrategyRegistered event.");
  }

  const submitTx = await tradingArena.submitResult(
    tokenId,
    BigInt(result.pnlBps),
    BigInt(result.totalTrades),
    BigInt(result.winningTrades),
    logUpload.rootHash,
    backtestLogHash
  );
  const submitReceipt = await submitTx.wait();

  const output = {
    marketDataRoot: marketUpload.rootHash,
    datasetVersionHash: datasetHashes.datasetVersionHash,
    evalWindowHash: datasetHashes.evalWindowHash,
    storageRoot: strategyUpload.rootHash,
    performancePointer: logUpload.rootHash,
    backtestLogHash,
    pnlBps: result.pnlBps,
    totalTrades: result.totalTrades,
    winningTrades: result.winningTrades,
    tokenId: tokenId.toString(),
    roundId: roundId.toString(),
    txHashes: {
      startRound: startTx.hash,
      registerStrategy: mintTx.hash,
      submitResult: submitTx.hash,
      marketUpload: marketUpload.txHash,
      strategyUpload: strategyUpload.txHash,
      logUpload: logUpload.txHash,
      submitReceipt: submitReceipt?.hash ?? submitTx.hash,
    },
  };

  const outputPath = path.resolve(args.outDir, "verify-user-story-2.json");
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log("verifyOutput:", outputPath);
  console.log("roundId:", roundId.toString());
  console.log("tokenId:", tokenId.toString());
  console.log("marketDataRoot:", marketUpload.rootHash);
  console.log("storageRoot:", strategyUpload.rootHash);
  console.log("performancePointer:", logUpload.rootHash);
  console.log("backtestLogHash:", backtestLogHash);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
