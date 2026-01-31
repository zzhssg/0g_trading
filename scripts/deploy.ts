import { ethers } from "hardhat";

async function main() {
  console.log("Deploying to 0G Galileo Testnet...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const StrategyNFT = await ethers.getContractFactory("StrategyNFT");
  const strategyNFT = await StrategyNFT.deploy();
  await strategyNFT.waitForDeployment();
  const strategyNFTAddress = await strategyNFT.getAddress();
  console.log("StrategyNFT deployed to:", strategyNFTAddress);

  const TradingArena = await ethers.getContractFactory("TradingArena");
  const tradingArena = await TradingArena.deploy(strategyNFTAddress);
  await tradingArena.waitForDeployment();
  const tradingArenaAddress = await tradingArena.getAddress();
  console.log("TradingArena deployed to:", tradingArenaAddress);

  console.log("\n--- Deployment Summary ---");
  console.log(`STRATEGY_NFT_ADDRESS=${strategyNFTAddress}`);
  console.log(`TRADING_ARENA_ADDRESS=${tradingArenaAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
