import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

describe("Train Together Eager SQL regression", () => {
  it("reproduces production ambiguity and executes the corrected RPC with lifecycle and authorization fixtures", async () => {
    const { stdout } = await promisify(execFile)(process.execPath, ["scripts/test-train-together-eager.mjs"]);
    expect(stdout).toContain("PASS: original ambiguity reproduced");
  }, 60000);
});
