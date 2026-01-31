import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { Indexer } from "@0glabs/0g-ts-sdk";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const root = searchParams.get("root");

  if (!root) {
    return NextResponse.json({ error: "missing root" }, { status: 400 });
  }

  const indexerUrl =
    process.env.INDEXER_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";
  const indexer = new Indexer(indexerUrl);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "0g-storage-"));
  const outPath = path.join(tempDir, "download.json");

  try {
    const err = await indexer.download(root, outPath, true);
    if (err) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }

    const content = fs.readFileSync(outPath, "utf8");
    return NextResponse.json({ content });
  } catch (error) {
    const message = error instanceof Error ? error.message : "download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    try {
      fs.unlinkSync(outPath);
      fs.rmdirSync(tempDir);
    } catch {
      // ignore cleanup errors
    }
  }
}
