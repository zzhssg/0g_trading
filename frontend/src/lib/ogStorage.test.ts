import { describe, expect, it, vi } from "vitest";
import {
  resolveStorageConfig,
  uploadJsonContent,
  uploadStrategyJson,
} from "./ogStorage";

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

  it("throws when signer missing for json upload", async () => {
    await expect(uploadJsonContent("{}", null)).rejects.toThrow("缺少钱包签名");
  });

  it("uploads json content with injected uploader", async () => {
    const rootHash = "0xjson";
    const result = await uploadJsonContent("{\"ok\":true}", { signer: true }, {
      resolveConfig: () => ({
        indexerUrl: "https://indexer",
        flowContract: "0xflow",
      }),
      upload: async () => rootHash,
    });

    expect(result).toBe(rootHash);
  });

  it("posts to storage upload api when no uploader provided", async () => {
    const rootHash = "0xapiroot";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rootHash }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await uploadJsonContent("{\"ok\":true}", { signer: true }, {
      resolveConfig: () => ({
        indexerUrl: "https://indexer",
        flowContract: "0xflow",
      }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/storage-upload",
      expect.objectContaining({ method: "POST" })
    );
    expect(result).toBe(rootHash);

    globalThis.fetch = originalFetch;
  });
});
