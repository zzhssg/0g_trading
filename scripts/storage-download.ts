import fs from "node:fs";
import { Indexer } from "@0glabs/0g-ts-sdk";

function parseArgs(argv: string[]) {
  const pick = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };

  const rootHash = pick("--root") ?? argv[0];
  const outPath = pick("--out") ?? argv[1] ?? "downloaded-bundle.json";

  if (!rootHash) {
    throw new Error("Usage: storage-download --root <hash> [--out path]");
  }

  return { rootHash, outPath };
}

async function main() {
  const indexerUrl =
    process.env.INDEXER_RPC ?? "https://indexer-storage-testnet-turbo.0g.ai";
  const args = parseArgs(process.argv.slice(2));

  const indexer = new Indexer(indexerUrl);
  await indexer.download(args.rootHash, args.outPath, true);
  const preview = fs.readFileSync(args.outPath, "utf8").slice(0, 200);
  console.log("downloaded:", args.outPath);
  console.log("preview:", preview);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
