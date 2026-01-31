import { expect } from "chai";
import hre from "hardhat";

describe("hardhat config", () => {
  it("uses cancun evmVersion", () => {
    const solidityConfig = hre.config.solidity;
    const evmVersion =
      typeof solidityConfig === "object" && "compilers" in solidityConfig
        ? solidityConfig.compilers?.[0]?.settings?.evmVersion
        : typeof solidityConfig === "object"
          ? solidityConfig.settings?.evmVersion
          : undefined;
    expect(evmVersion).to.equal("cancun");
  });
});
