import { expect } from "chai";
import { ethers } from "hardhat";

describe("TradingArena", () => {
  it("only owner can start round and round stores dataset hashes", async () => {
    const [owner, other] = await ethers.getSigners();
    const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
    const nft = await StrategyNFT.deploy();
    await nft.waitForDeployment();

    const TradingArena = await ethers.getContractFactory("TradingArena");
    const arena = await TradingArena.deploy(await nft.getAddress());
    await arena.waitForDeployment();

    const marketDataRoot = ethers.keccak256(ethers.toUtf8Bytes("marketdata"));
    const datasetVersionHash = ethers.keccak256(ethers.toUtf8Bytes("v1"));
    const evalWindowHash = ethers.keccak256(
      ethers.toUtf8Bytes("2024-01-01T00:00:00Z~2024-01-07T00:00:00Z")
    );

    await expect(
      arena.connect(other).startNewRound(marketDataRoot, datasetVersionHash, evalWindowHash)
    ).to.be.reverted;

    await expect(
      arena.startNewRound(marketDataRoot, datasetVersionHash, evalWindowHash)
    ).to.emit(arena, "RoundStarted");

    const round = await arena.rounds(1);
    expect(round.marketDataRoot).to.equal(marketDataRoot);
    expect(round.datasetVersionHash).to.equal(datasetVersionHash);
    expect(round.evalWindowHash).to.equal(evalWindowHash);
  });

  it("rejects duplicate result submissions for a round", async () => {
    const [owner] = await ethers.getSigners();
    const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
    const nft = await StrategyNFT.deploy();
    await nft.waitForDeployment();

    const TradingArena = await ethers.getContractFactory("TradingArena");
    const arena = await TradingArena.deploy(await nft.getAddress());
    await arena.waitForDeployment();

    const marketDataRoot = ethers.keccak256(ethers.toUtf8Bytes("marketdata"));
    const datasetVersionHash = ethers.keccak256(ethers.toUtf8Bytes("v1"));
    const evalWindowHash = ethers.keccak256(
      ethers.toUtf8Bytes("2024-01-01T00:00:00Z~2024-01-07T00:00:00Z")
    );
    await arena.startNewRound(marketDataRoot, datasetVersionHash, evalWindowHash);

    const codeHash = ethers.keccak256(ethers.toUtf8Bytes("code"));
    const paramsHash = ethers.keccak256(ethers.toUtf8Bytes("params"));
    const register = async () => {
      const data = nft.interface.encodeFunctionData("registerStrategy", [
        codeHash,
        paramsHash,
        "v1",
        "2024-01-01T00:00:00Z~2024-01-07T00:00:00Z",
        "storage-root",
        "performance-pointer",
        "ipfs://token",
      ]);
      await owner.sendTransaction({ to: await nft.getAddress(), data });
      return await nft.totalStrategies();
    };
    const strategyId = await register();

    const backtestLogRoot = ethers.keccak256(ethers.toUtf8Bytes("log-root"));
    const executionLogHash = ethers.keccak256(ethers.toUtf8Bytes("log-hash"));

    await arena.submitResult(strategyId, 100, 10, 6, backtestLogRoot, executionLogHash);
    await expect(
      arena.submitResult(strategyId, 120, 12, 7, backtestLogRoot, executionLogHash)
    ).to.be.reverted;
  });

  it("stores result bindings and returns round leaderboard sorted by pnl", async () => {
    const [owner] = await ethers.getSigners();
    const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
    const nft = await StrategyNFT.deploy();
    await nft.waitForDeployment();

    const TradingArena = await ethers.getContractFactory("TradingArena");
    const arena = await TradingArena.deploy(await nft.getAddress());
    await arena.waitForDeployment();

    const marketDataRoot = ethers.keccak256(ethers.toUtf8Bytes("marketdata"));
    const datasetVersionHash = ethers.keccak256(ethers.toUtf8Bytes("v1"));
    const evalWindowHash = ethers.keccak256(
      ethers.toUtf8Bytes("2024-01-01T00:00:00Z~2024-01-07T00:00:00Z")
    );
    await arena.startNewRound(marketDataRoot, datasetVersionHash, evalWindowHash);

    const codeHashA = ethers.keccak256(ethers.toUtf8Bytes("code-a"));
    const paramsHashA = ethers.keccak256(ethers.toUtf8Bytes("params-a"));
    const codeHashB = ethers.keccak256(ethers.toUtf8Bytes("code-b"));
    const paramsHashB = ethers.keccak256(ethers.toUtf8Bytes("params-b"));

    const register = async (codeHash: string, paramsHash: string) => {
      const data = nft.interface.encodeFunctionData("registerStrategy", [
        codeHash,
        paramsHash,
        "v1",
        "2024-01-01T00:00:00Z~2024-01-07T00:00:00Z",
        "storage-root",
        "performance-pointer",
        "ipfs://token",
      ]);
      await owner.sendTransaction({ to: await nft.getAddress(), data });
      return await nft.totalStrategies();
    };

    const strategyA = await register(codeHashA, paramsHashA);
    const strategyB = await register(codeHashB, paramsHashB);

    const backtestLogRoot = ethers.keccak256(ethers.toUtf8Bytes("log-root"));
    const executionLogHash = ethers.keccak256(ethers.toUtf8Bytes("log-hash"));

    await arena.submitResult(strategyA, 50, 10, 6, backtestLogRoot, executionLogHash);
    await arena.submitResult(strategyB, 120, 12, 7, backtestLogRoot, executionLogHash);

    const result = await arena.getResult(1, strategyB);
    expect(result.codeHash).to.equal(codeHashB);
    expect(result.paramsHash).to.equal(paramsHashB);
    expect(result.marketDataRoot).to.equal(marketDataRoot);
    expect(result.datasetVersionHash).to.equal(datasetVersionHash);
    expect(result.evalWindowHash).to.equal(evalWindowHash);
    expect(result.backtestLogRoot).to.equal(backtestLogRoot);

    const leaderboard = await arena.getLeaderboardByRound(1, 10);
    expect(leaderboard.strategyIds[0]).to.equal(strategyB);
    expect(leaderboard.pnls[0]).to.equal(120);
    expect(leaderboard.strategyIds[1]).to.equal(strategyA);
    expect(leaderboard.pnls[1]).to.equal(50);
  });
});
