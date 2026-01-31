import { expect } from "chai";
import {
  computeDatasetHashes,
  parseVerifyUserStoryArgs,
} from "../scripts/verify-user-story-2";

const sampleMarket = {
  schemaVersion: "market-json-v1",
  datasetVersion: "v1",
  evalWindow: "2024-01-01T00:00:00Z~2024-01-02T00:00:00Z",
  scale: { price: 100, volume: 100 },
  rows: [
    {
      ts: "2024-01-01T00:00:00Z",
      open: 10000,
      high: 11000,
      low: 9000,
      close: 10500,
      volume: 10,
    },
  ],
};

describe("verify-user-story-2", () => {
  it("parses required args and defaults", () => {
    const args = parseVerifyUserStoryArgs([
      "--market",
      "m.json",
      "--strategy",
      "s.json",
      "--arena",
      "0x0000000000000000000000000000000000000001",
      "--nft",
      "0x0000000000000000000000000000000000000002",
    ]);

    expect(args.marketPath).to.equal("m.json");
    expect(args.strategyPath).to.equal("s.json");
    expect(args.arenaAddress).to.equal(
      "0x0000000000000000000000000000000000000001"
    );
    expect(args.nftAddress).to.equal(
      "0x0000000000000000000000000000000000000002"
    );
    expect(args.size).to.equal(1);
    expect(args.outDir).to.equal("./data/verify");
  });

  it("computes dataset and eval window hashes", () => {
    const hashes = computeDatasetHashes(sampleMarket);
    expect(hashes.datasetVersionHash).to.match(/^0x[0-9a-f]{64}$/);
    expect(hashes.evalWindowHash).to.match(/^0x[0-9a-f]{64}$/);
  });

  it("accepts lowercase outdir flag", () => {
    const args = parseVerifyUserStoryArgs([
      "--market",
      "m.json",
      "--strategy",
      "s.json",
      "--arena",
      "0x0000000000000000000000000000000000000001",
      "--nft",
      "0x0000000000000000000000000000000000000002",
      "--outdir",
      "./data/custom",
    ]);
    expect(args.outDir).to.equal("./data/custom");
  });

  it("accepts root overrides", () => {
    const args = parseVerifyUserStoryArgs([
      "--market",
      "m.json",
      "--strategy",
      "s.json",
      "--arena",
      "0x0000000000000000000000000000000000000001",
      "--nft",
      "0x0000000000000000000000000000000000000002",
      "--market-root",
      "0x" + "11".repeat(32),
      "--strategy-root",
      "0x" + "22".repeat(32),
      "--log-root",
      "0x" + "33".repeat(32),
    ]);
    expect(args.marketRoot).to.equal("0x" + "11".repeat(32));
    expect(args.strategyRoot).to.equal("0x" + "22".repeat(32));
    expect(args.logRoot).to.equal("0x" + "33".repeat(32));
  });
});
