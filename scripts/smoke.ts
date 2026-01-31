import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No signer available. Check PRIVATE_KEY in .env/siyao.");
  }

  const strategyNFTAddress = "0x0E039e652b8E5CAb7a59b91e8A527C41750C8e9b";
  const tradingArenaAddress = "0x3a0Ac6C236e4fADd088Ec187563a78707Ab7B7C8";

  const strategyNFT = await ethers.getContractAt(
    "StrategyNFT",
    strategyNFTAddress,
    deployer
  );
  const tradingArena = await ethers.getContractAt(
    "TradingArena",
    tradingArenaAddress,
    deployer
  );

  console.log("Signer:", deployer.address);
  console.log("StrategyNFT:", strategyNFTAddress);
  console.log("TradingArena:", tradingArenaAddress);

  const marketDataRoot = ethers.keccak256(
    ethers.toUtf8Bytes("demo-market-data-2026-01-31")
  );
  const datasetVersionHash = ethers.keccak256(ethers.toUtf8Bytes("v1"));
  const evalWindowHash = ethers.keccak256(
    ethers.toUtf8Bytes("2024-01-01T00:00:00Z~2024-01-07T00:00:00Z")
  );
  const startTx = await tradingArena.startNewRound(
    marketDataRoot,
    datasetVersionHash,
    evalWindowHash
  );
  await startTx.wait();
  const roundId = await tradingArena.currentRound();
  console.log("Started round:", roundId.toString());

  const strategyJson = JSON.stringify({
    name: "Smoke-Test-Strategy",
    params: { lookback: 20, threshold: 0.02 },
  });
  const codeHash = ethers.keccak256(ethers.toUtf8Bytes(strategyJson));
  const paramsHash = ethers.keccak256(ethers.toUtf8Bytes(strategyJson));
  const datasetVersion = "v1";
  const evalWindow = "2025-01-01~2025-02-01";
  const metadata = {
    name: "Smoke-Test-Strategy",
    description: "INFT smoke test",
    attributes: [
      { trait_type: "Code Hash", value: codeHash },
      { trait_type: "Params Hash", value: paramsHash },
      { trait_type: "Dataset Version", value: datasetVersion },
      { trait_type: "Eval Window", value: evalWindow },
      { trait_type: "Created At", value: new Date().toISOString() },
    ],
  };
  const tokenURI = `data:application/json;base64,${Buffer.from(
    JSON.stringify(metadata)
  ).toString("base64")}`;

  const mintTx = await strategyNFT.registerStrategy(
    codeHash,
    paramsHash,
    datasetVersion,
    evalWindow,
    codeHash,
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
    } catch (error) {
      // ignore non-matching logs
    }
  }

  if (tokenId === null) {
    throw new Error("Failed to parse StrategyRegistered event.");
  }

  console.log("Minted strategy tokenId:", tokenId.toString());

  const submitTx = await tradingArena.submitResult(
    tokenId,
    1245,
    12,
    7,
    ethers.keccak256(ethers.toUtf8Bytes("demo-backtest-log-root")),
    ethers.keccak256(ethers.toUtf8Bytes("demo-execution-log"))
  );
  await submitTx.wait();

  const result = await tradingArena.getResult(roundId, tokenId);
  console.log("Result:", {
    strategyId: result.strategyId.toString(),
    pnl: result.pnl.toString(),
    totalTrades: result.totalTrades.toString(),
    winningTrades: result.winningTrades.toString(),
    executionLogHash: result.executionLogHash,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
