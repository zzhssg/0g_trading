import { expect } from "chai";
import { parseFileUploadArgs } from "../scripts/lib/storageBundle";

describe("storage file upload args", () => {
  it("parses file upload args", () => {
    const args = parseFileUploadArgs([
      "--file",
      "./market.json",
      "--out",
      "./out.json",
    ]);
    expect(args.filePath).to.equal("./market.json");
    expect(args.outPath).to.equal("./out.json");
  });
});
