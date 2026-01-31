import { describe, expect, it } from "vitest";
import { resolveStorageConfig, uploadStrategyJson } from "./ogStorage";

describe("ogStorage", () => {
  it("throws when storage config is missing", () => {
    expect(() =>
      resolveStorageConfig({
        env: {
          NEXT_PUBLIC_STORAGE_INDEXER: "",
          NEXT_PUBLIC_FLOW_CONTRACT: "",
        },
        useDefaults: false,
      })
    ).toThrow("缺少 NEXT_PUBLIC_STORAGE_INDEXER");
  });

  it("uses injected uploader and returns rootHash", async () => {
    const rootHash = "0xroot";
    const result = await uploadStrategyJson("{}", { signer: true }, {
      resolveConfig: () => ({
        indexerUrl: "https://indexer",
        flowContract: "0xflow",
      }),
      upload: async () => rootHash,
    });

    expect(result).toBe(rootHash);
  });
});
