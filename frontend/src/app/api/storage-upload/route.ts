import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { ethers } from "ethers";

export const runtime = "nodejs";

type UploadRequest = {
  content?: string;
  indexerUrl?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function POST(request: Request) {
  let payload: UploadRequest | null = null;
  try {
    payload = (await request.json()) as UploadRequest;
  } catch {
    payload = null;
  }

  const content = payload?.content;
  if (!isNonEmptyString(content)) {
    return NextResponse.json({ error: "missing content" }, { status: 400 });
  }

  const rpc = process.env.RPC_URL ?? "https://evmrpc-testnet.0g.ai";
  const indexerUrl =
    payload?.indexerUrl ??
    process.env.INDEXER_RPC ??
    "https://indexer-storage-testnet-turbo.0g.ai";
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    return NextResponse.json({ error: "missing PRIVATE_KEY" }, { status: 500 });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "0g-upload-"));
  const filePath = path.join(tempDir, "market.json");

  try {
    fs.writeFileSync(filePath, content, "utf8");

    const { Indexer, ZgFile } = await import("@0glabs/0g-ts-sdk");
    const provider = new ethers.JsonRpcProvider(rpc);
    const signer = new ethers.Wallet(privateKey, provider);
    const indexer = new Indexer(indexerUrl);

    const file = await ZgFile.fromFilePath(filePath);
    try {
      const [tree, treeErr] = await file.merkleTree();
      if (treeErr) {
        throw treeErr;
      }
      const [tx, uploadErr] = await indexer.upload(file, rpc, signer);
      if (uploadErr) {
        throw uploadErr;
      }

      return NextResponse.json({
        rootHash: tree.rootHash(),
        txHash: tx?.hash ?? null,
      });
    } finally {
      await file.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    try {
      fs.unlinkSync(filePath);
      fs.rmdirSync(tempDir);
    } catch {
      // ignore cleanup errors
    }
  }
}
