import { expect } from "chai";
import { ethers } from "hardhat";

describe("TradingArena", function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();
    const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
    const nft = await StrategyNFT.deploy();
    await nft.waitForDeployment();

    const TradingArena = await ethers.getContractFactory("TradingArena");
    const arena = await TradingArena.deploy(await nft.getAddress());
    await arena.waitForDeployment();

    const codeHash = ethers.keccak256(ethers.toUtf8Bytes("code"));
    const paramsHash = ethers.keccak256(ethers.toUtf8Bytes("params"));
    const datasetVersion = "v1";
    const evalWindow = "2025-01-01~2025-02-01";
    const storageRoot = "root";
    const tokenURI = "ipfs://token";

    await nft.registerStrategy(
      codeHash,
      paramsHash,
      datasetVersion,
      evalWindow,
      storageRoot,
      tokenURI
    );

    const marketDataHash = ethers.keccak256(ethers.toUtf8Bytes("market"));
    await arena.startNewRound(marketDataHash);

    return {
      owner,
      other,
      nft,
      arena,
      codeHash,
      paramsHash,
      datasetVersion,
      evalWindow,
      marketDataHash,
    };
  }

  it("only owner can submit and cannot resubmit in same round", async function () {
    const { other, arena } = await deployFixture();
    await expect(
      arena
        .connect(other)
        .submitResult(
          1,
          100,
          10,
          6,
          ethers.keccak256(ethers.toUtf8Bytes("log"))
        )
    ).to.be.revertedWith("Only strategy owner");
  });

  it("binds hashes and verifies result", async function () {
    const {
      owner,
      arena,
      codeHash,
      paramsHash,
      datasetVersion,
      evalWindow,
      marketDataHash,
    } = await deployFixture();

    const executionLogHash = ethers.keccak256(ethers.toUtf8Bytes("log"));
    await arena
      .connect(owner)
      .submitResult(1, 100, 10, 6, executionLogHash);

    const datasetVersionHash = ethers.keccak256(
      ethers.toUtf8Bytes(datasetVersion)
    );
    const evalWindowHash = ethers.keccak256(ethers.toUtf8Bytes(evalWindow));

    expect(
      await arena.verifyResult(
        1,
        1,
        executionLogHash,
        codeHash,
        paramsHash,
        datasetVersionHash,
        evalWindowHash,
        marketDataHash
      )
    ).to.equal(true);

    expect(
      await arena.verifyResult(
        1,
        1,
        ethers.keccak256(ethers.toUtf8Bytes("bad")),
        codeHash,
        paramsHash,
        datasetVersionHash,
        evalWindowHash,
        marketDataHash
      )
    ).to.equal(false);
  });

  it("blocks duplicate submissions", async function () {
    const { owner, arena } = await deployFixture();
    const executionLogHash = ethers.keccak256(ethers.toUtf8Bytes("log"));
    await arena
      .connect(owner)
      .submitResult(1, 100, 10, 6, executionLogHash);

    await expect(
      arena
        .connect(owner)
        .submitResult(1, 200, 10, 6, executionLogHash)
    ).to.be.revertedWith("Result already submitted");
  });

  it("sorts leaderboard by totalPnL", async function () {
    const [owner, other] = await ethers.getSigners();
    const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
    const nft = await StrategyNFT.deploy();
    await nft.waitForDeployment();

    const TradingArena = await ethers.getContractFactory("TradingArena");
    const arena = await TradingArena.deploy(await nft.getAddress());
    await arena.waitForDeployment();

    const codeHash = ethers.keccak256(ethers.toUtf8Bytes("code"));
    const paramsHash = ethers.keccak256(ethers.toUtf8Bytes("params"));
    const datasetVersion = "v1";
    const evalWindow = "2025-01-01~2025-02-01";
    const storageRoot = "root";
    const tokenURI = "ipfs://token";

    await nft.registerStrategy(
      codeHash,
      paramsHash,
      datasetVersion,
      evalWindow,
      storageRoot,
      tokenURI
    );
    await nft
      .connect(other)
      .registerStrategy(
        codeHash,
        paramsHash,
        datasetVersion,
        evalWindow,
        storageRoot,
        tokenURI
      );

    await arena.startNewRound(ethers.keccak256(ethers.toUtf8Bytes("market")));

    await arena
      .connect(owner)
      .submitResult(
        1,
        50,
        10,
        6,
        ethers.keccak256(ethers.toUtf8Bytes("log1"))
      );
    await arena
      .connect(other)
      .submitResult(
        2,
        120,
        10,
        6,
        ethers.keccak256(ethers.toUtf8Bytes("log2"))
      );

    const [ids, pnls] = await arena.getLeaderboard(2);
    expect(ids[0]).to.equal(2);
    expect(pnls[0]).to.equal(120);
    expect(ids[1]).to.equal(1);
    expect(pnls[1]).to.equal(50);
  });
});
