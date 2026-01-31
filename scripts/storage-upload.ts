import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { ZgFile, Indexer } from "@0glabs/0g-ts-sdk";
import {
  buildStorageBundle,
  buildUploadOutputs,
  parseStorageArgs,
} from "./lib/storageBundle";

type UploadResult = {
  rootHash: string;
  txHash: string;
};

async function uploadFile(
  indexer: Indexer,
  rpc: string,
  signer: ethers.Wallet,
  filePath: string
): Promise<UploadResult> {
  const file = await ZgFile.fromFilePath(filePath);
  const [res, err] = await indexer.upload(file, rpc, signer);
  await file.close();
  if (err) {
    throw err;
  }
  return res;
}

async function main() {
  const rpc = process.env.RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const indexerUrl =
    process.env.INDEXER_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";
  const privateKey = process.env.PRIVATE_KEY;

  if (!privateKey) {
    throw new Error("Missing PRIVATE_KEY in env");
  }

  const args = parseStorageArgs(process.argv.slice(2));
  const strategyRaw = fs.readFileSync(args.strategyPath, "utf8");
  const paramsRaw = fs.readFileSync(args.paramsPath, "utf8");
  const backtestLog = fs.readFileSync(args.logPath, "utf8");
  const strategy = JSON.parse(strategyRaw);
  const params = JSON.parse(paramsRaw);
  const bundle = buildStorageBundle({ strategy, params, backtestLog });

  const outPath = path.resolve(args.outPath);
  const bundlePath = outPath.replace(/\.json$/i, ".bundle.json");
  const metadataPath = outPath.replace(/\.json$/i, ".metadata.json");

  fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));

  const provider = new ethers.JsonRpcProvider(rpc);
  const signer = new ethers.Wallet(privateKey, provider);
  const indexer = new Indexer(indexerUrl);

  const strategyUpload = await uploadFile(
    indexer,
    rpc,
    signer,
    path.resolve(args.strategyPath)
  );
  const logUpload = await uploadFile(
    indexer,
    rpc,
    signer,
    path.resolve(args.logPath)
  );

  const metadata = {
    name: strategy?.name ?? "Strategy",
    description: "0G INFT Strategy Metadata",
    storageRoot: strategyUpload.rootHash,
    performancePointer: logUpload.rootHash,
    backtestLogHash: bundle.backtestLogHash,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  const metadataUpload = await uploadFile(
    indexer,
    rpc,
    signer,
    metadataPath
  );

  const outputs = buildUploadOutputs({
    strategyRoot: strategyUpload.rootHash,
    logRoot: logUpload.rootHash,
    metadataRoot: metadataUpload.rootHash,
  });
  const outputPayload = {
    ...outputs,
    backtestLogHash: bundle.backtestLogHash,
    bundlePath,
    metadataPath,
  };
  fs.writeFileSync(outPath, JSON.stringify(outputPayload, null, 2));

  console.log("storageRoot:", outputs.storageRoot);
  console.log("performancePointer:", outputs.performancePointer);
  console.log("tokenURI:", outputs.tokenURI);
  console.log("backtestLogHash:", bundle.backtestLogHash);
  console.log("strategyTx:", strategyUpload.txHash);
  console.log("logTx:", logUpload.txHash);
  console.log("metadataTx:", metadataUpload.txHash);
  console.log("bundlePath:", bundlePath);
  console.log("metadataPath:", metadataPath);
  console.log("outputsPath:", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
