import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vitest";
import { openssl } from "./openssl-node.ts";

test("openssl generates an RSA private key file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openssl-node-"));
  const keyPath = join(directory, "private-key.key");

  try {
    const result = await openssl("genrsa", ["-out", keyPath, "2048"]);
    expect(result.command).toBe("genrsa");
    expect(result.args).toEqual(["-out", keyPath, "2048"]);

    const fileStats = await stat(keyPath);
    const keyContents = await readFile(keyPath, "utf8");
    expect(fileStats.isFile()).toBe(true);
    expect(fileStats.size).toBeGreaterThan(0);
    expect(keyContents).toContain("PRIVATE KEY");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
