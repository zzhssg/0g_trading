export const DEFAULT_STORAGE_INDEXER =
  "https://indexer-storage-testnet-turbo.0g.ai";
export const DEFAULT_FLOW_CONTRACT =
  "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296";

type StorageEnv = {
  NEXT_PUBLIC_STORAGE_INDEXER?: string;
  NEXT_PUBLIC_FLOW_CONTRACT?: string;
};

export type StorageConfig = {
  indexerUrl: string;
  flowContract: string;
};

export type ResolveStorageConfigOptions = {
  env?: StorageEnv;
  useDefaults?: boolean;
};

export type UploadStrategyDeps = {
  resolveConfig?: () => StorageConfig;
  upload?: (
    content: string,
    signer: unknown,
    config: StorageConfig
  ) => Promise<string>;
};

function normalizeEnvValue(value?: string) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveStorageConfig(
  options: ResolveStorageConfigOptions = {}
): StorageConfig {
  const env = options.env ?? (typeof process !== "undefined" ? process.env : {});
  const useDefaults = options.useDefaults ?? true;

  const indexerUrl =
    normalizeEnvValue(env.NEXT_PUBLIC_STORAGE_INDEXER) ??
    (useDefaults ? DEFAULT_STORAGE_INDEXER : undefined);
  if (!indexerUrl) {
    throw new Error("缺少 NEXT_PUBLIC_STORAGE_INDEXER");
  }

  const flowContract =
    normalizeEnvValue(env.NEXT_PUBLIC_FLOW_CONTRACT) ??
    (useDefaults ? DEFAULT_FLOW_CONTRACT : undefined);
  if (!flowContract) {
    throw new Error("缺少 NEXT_PUBLIC_FLOW_CONTRACT");
  }

  return { indexerUrl, flowContract };
}

export async function uploadStrategyJson(
  content: string,
  signer: unknown,
  deps: UploadStrategyDeps = {}
): Promise<string> {
  const config = deps.resolveConfig ? deps.resolveConfig() : resolveStorageConfig();
  if (!signer) {
    throw new Error("缺少钱包签名");
  }
  if (deps.upload) {
    return deps.upload(content, signer, config);
  }

  const { Indexer, ZgFile, getFlowContract } = await import("@0glabs/0g-ts-sdk");
  const blob = new Blob([content], { type: "application/json" });
  if (typeof ZgFile?.fromBlob !== "function") {
    throw new Error("ZgFile.fromBlob is not available in this SDK build");
  }
  const file = await ZgFile.fromBlob(blob);
  const [tree, treeErr] = await file.merkleTree();
  if (treeErr) {
    throw treeErr;
  }
  const indexer = new Indexer(config.indexerUrl);
  const flowContract = getFlowContract(config.flowContract, signer);
  await file.upload(flowContract, indexer);
  const rootHash = tree.rootHash();
  if (file.close) {
    await file.close();
  }
  return rootHash;
}
