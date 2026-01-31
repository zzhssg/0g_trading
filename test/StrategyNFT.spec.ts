import { expect } from "chai";
import { ethers } from "hardhat";

describe("StrategyNFT", function () {
  it("registers a strategy with extended verification fields", async function () {
    const [owner] = await ethers.getSigners();
    const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
    const nft = await StrategyNFT.deploy();
    await nft.waitForDeployment();

    const codeHash = ethers.keccak256(ethers.toUtf8Bytes("code"));
    const paramsHash = ethers.keccak256(ethers.toUtf8Bytes("params"));
    const datasetVersion = "v1";
    const evalWindow = "2025-01-01~2025-02-01";
    const storageRoot = "root";
    const performancePointer = "perf-root";
    const tokenURI = "ipfs://token";

    await expect(
      nft.registerStrategy(
        codeHash,
        paramsHash,
        datasetVersion,
        evalWindow,
        storageRoot,
        performancePointer,
        tokenURI
      )
    )
      .to.emit(nft, "StrategyRegistered")
      .withArgs(
        1,
        owner.address,
        codeHash,
        paramsHash,
        datasetVersion,
        evalWindow,
        storageRoot,
        performancePointer
      );

    const strategy = await nft.getStrategy(1);
    expect(strategy.codeHash).to.equal(codeHash);
    expect(strategy.paramsHash).to.equal(paramsHash);
    expect(strategy.datasetVersion).to.equal(datasetVersion);
    expect(strategy.evalWindow).to.equal(evalWindow);
    expect(strategy.storageRoot).to.equal(storageRoot);
    expect(strategy.performancePointer).to.equal(performancePointer);
    expect(strategy.creator).to.equal(owner.address);
  });

  it("stores performancePointer", async function () {
    const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
    const nft = await StrategyNFT.deploy();
    await nft.waitForDeployment();

    await nft.registerStrategy(
      ethers.keccak256(ethers.toUtf8Bytes("code")),
      ethers.keccak256(ethers.toUtf8Bytes("params")),
      "v1",
      "window",
      "storage-root",
      "perf-root",
      "token-uri"
    );

    const strategy = await nft.getStrategy(1);
    expect(strategy.performancePointer).to.equal("perf-root");
  });
});
