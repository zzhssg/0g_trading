import { ethers } from "hardhat";

async function main() {
  const addresses = [
    { name: "TradingArena", address: "0x3a0Ac6C236e4fADd088Ec187563a78707Ab7B7C8" },
    { name: "StrategyNFT", address: "0x0E039e652b8E5CAb7a59b91e8A527C41750C8e9b" },
  ];

  console.log("Checking contract deployment status on 0G Testnet...\n");

  for (const { name, address } of addresses) {
    try {
      const code = await ethers.provider.getCode(address);
      if (code === "0x") {
        console.log(`❌ ${name} (${address}): Not deployed`);
      } else {
        console.log(`✅ ${name} (${address}): Deployed (code length: ${code.length / 2 - 1} bytes)`);
      }
    } catch (error) {
      console.log(`❌ ${name} (${address}): Error checking - ${error}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
