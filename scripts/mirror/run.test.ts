import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLANTED } from "./gate.ts";
import { main } from "./run.ts";
import {
  commitAll,
  fakeGitleaks,
  git,
  hashedDenylist,
} from "./test-helpers.ts";

const NAME = PLANTED.name;
const DENYLIST = [...hashedDenylist(NAME)].join("\n");
const ARGS = ["--dry-run", "--ref", "HEAD"];
const deps = { gitleaks: fakeGitleaks };

let repo: string;
let logs: string[];
let restore: (() => void)[];

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "mirror-run-test-"));
  git(repo, "init", "-q", "-b", "main");
  logs = [];
  const log = spyOn(console, "log").mockImplementation((...a) => {
    logs.push(a.join(" "));
  });
  const err = spyOn(console, "error").mockImplementation((...a) => {
    logs.push(a.join(" "));
  });
  restore = [() => log.mockRestore(), () => err.mockRestore()];
});
afterEach(() => {
  restore.forEach((fn) => fn());
  rmSync(repo, { recursive: true, force: true });
});

describe("main", () => {
  test("an empty denylist exits 1", async () => {
    commitAll(repo, { "a.txt": "hello\n" });
    const code = await main(
      [...ARGS, "--repo", repo],
      { MIRROR_DENYLIST: "" },
      deps,
    );
    expect(code).toBe(1);
  });

  test("a plaintext denylist exits 1 without echoing it", async () => {
    commitAll(repo, { "a.txt": "hello\n" });
    const code = await main(
      [...ARGS, "--repo", repo],
      { MIRROR_DENYLIST: NAME },
      deps,
    );
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("not a truncated hash");
    expect(logs.join("\n")).not.toContain(NAME);
  });

  test("findings exit 1 and print no matched value", async () => {
    commitAll(repo, { "a.txt": `Signed, ${NAME}\n` });
    const code = await main(
      [...ARGS, "--repo", repo],
      { MIRROR_DENYLIST: DENYLIST },
      deps,
    );
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("denylist a.txt:1");
    expect(logs.join("\n")).not.toContain(NAME);
  });

  test("a denylisted path is redacted in every finding of that file", async () => {
    commitAll(repo, { [`${NAME}.txt`]: `${PLANTED.email}\n` });
    const code = await main(
      [...ARGS, "--repo", repo],
      { MIRROR_DENYLIST: DENYLIST },
      deps,
    );
    expect(code).toBe(1);
    const output = logs.join("\n");
    expect(output).toContain("denylist <path redacted>:0");
    expect(output).toContain("email <path redacted>:1");
    expect(output.toLowerCase()).not.toContain(NAME.toLowerCase());
  });

  test("a self-test miss names the layer", async () => {
    commitAll(repo, { "a.txt": "hello\n" });
    const code = await main(
      [...ARGS, "--repo", repo],
      { MIRROR_DENYLIST: DENYLIST },
      { gitleaks: async () => [] },
    );
    expect(code).toBe(1);
    expect(logs.join("\n")).toContain("Self-test missed: gitleaks");
  });

  test("a dry run without a token on a clean repo exits 0 and skips publish", async () => {
    commitAll(repo, { "a.txt": "hello\n" });
    const code = await main(
      [...ARGS, "--repo", repo],
      { MIRROR_DENYLIST: DENYLIST },
      deps,
    );
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("publish skipped");
    expect(logs.join("\n")).not.toContain("Pushed");
  });

  test("a real run without a token exits 1", async () => {
    commitAll(repo, { "a.txt": "hello\n" });
    const code = await main(
      ["--ref", "HEAD", "--repo", repo],
      { MIRROR_DENYLIST: DENYLIST },
      deps,
    );
    expect(code).toBe(1);
  });

  test.each([["--denylist-file"], ["--ref"], ["--repo"]])(
    "%s without a value exits 1 instead of falling back",
    async (flag) => {
      commitAll(repo, { "a.txt": "hello\n" });
      const code = await main(
        ["--dry-run", "--repo", repo, flag],
        { MIRROR_DENYLIST: DENYLIST },
        deps,
      );
      expect(code).toBe(1);
      expect(logs.join("\n")).toContain(`${flag} needs a value`);
    },
  );
});
