import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk";
import { parseFileUploadArgs } from "./lib/storageBundle";

async function main() {
  const rpc = process.env.RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const indexerUrl =
    process.env.INDEXER_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("Missing PRIVATE_KEY in env");
  }

  const { filePath, outPath } = parseFileUploadArgs(process.argv.slice(2));

  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(privateKey, provider);
  const indexer = new Indexer(indexerUrl);

  const file = await ZgFile.fromFilePath(filePath);
  const [tree] = await file.merkleTree();
  const [tx] = await indexer.upload(file, rpc, signer);
  await file.close();

  const result = {
    filePath,
    root: tree.rootHash(),
    txHash: tx?.hash ?? null,
  };

  fs.writeFileSync(path.resolve(outPath), JSON.stringify(result, null, 2));
  console.log(result);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
