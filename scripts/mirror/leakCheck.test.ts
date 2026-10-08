import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkLeaks,
  copyWorkingTree,
  GATE_FILE,
  GITLEAKS_MISSING_NOTICE,
  listWorkingTree,
} from "./leakCheck.ts";
import { git } from "./test-helpers.ts";

const TIMEOUT_MS = 60_000;
const SHORT_TIMEOUT_MS = 500;
const SPACED = "with space.ts";
const NEWLINED = "with\nnewline.ts";

const roots: string[] = [];
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "leak-check-test-"));
  roots.push(dir);
  return dir;
};
afterAll(() =>
  roots.forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);

function write(repo: string, path: string, text: string) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function makeRepo() {
  const repo = temp();
  git(repo, "init", "-q");
  write(repo, ".gitignore", ".env.local\n");
  write(repo, "src/a.ts", "export {};\n");
  write(repo, ".env.local", "SECRET=1\n");
  write(repo, "untracked.ts", "x\n");
  write(repo, SPACED, "x\n");
  write(repo, NEWLINED, "x\n");
  write(repo, "gone.ts", "x\n");
  mkdirSync(join(repo, "dir"));
  symlinkSync(join(repo, "dir"), join(repo, "dir-link"));
  git(repo, "add", ".gitignore", "src/a.ts", "gone.ts");
  rmSync(join(repo, "gone.ts"));
  return repo;
}

describe("listWorkingTree", () => {
  test("lists tracked and untracked-not-ignored files, skips ignored, deleted and directories", () => {
    const files = listWorkingTree(makeRepo());
    expect(files).toContain("src/a.ts");
    expect(files).toContain("untracked.ts");
    expect(files).toContain(SPACED);
    expect(files).toContain(NEWLINED);
    expect(files).not.toContain(".env.local");
    expect(files).not.toContain("gone.ts");
    expect(files).not.toContain("dir-link");
  });
});

describe("copyWorkingTree", () => {
  test("copies exactly those files", () => {
    const repo = makeRepo();
    const dest = temp();
    copyWorkingTree(repo, dest);
    for (const path of ["src/a.ts", "untracked.ts", SPACED, NEWLINED])
      expect(existsSync(join(dest, path))).toBe(true);
    expect(existsSync(join(dest, ".env.local"))).toBe(false);
    expect(existsSync(join(dest, "dir-link"))).toBe(false);
  });
});

describe("checkLeaks", () => {
  const gateRepo = (body: string) => {
    const repo = temp();
    git(repo, "init", "-q");
    write(
      repo,
      GATE_FILE,
      `import { describe, expect, test } from "bun:test";\n${body}\n`,
    );
    return repo;
  };
  const passing =
    'describe("real tree", () => { test("scan", () => { expect([]).toEqual([]); }); });';
  const fakeGitleaks = (exitCode: number) => {
    const bin = join(temp(), "gitleaks");
    writeFileSync(
      bin,
      `#!/bin/sh\necho "gitleaks ran"\nexit ${String(exitCode)}\n`,
    );
    chmodSync(bin, 0o755);
    return bin;
  };

  test("is missing when the checkout has no gate", () => {
    expect(checkLeaks(temp(), TIMEOUT_MS)).toEqual({ status: "missing" });
  });

  test("passes with a notice when gitleaks is absent", () => {
    const result = checkLeaks(gateRepo(passing), TIMEOUT_MS, undefined);
    expect(result.status).toBe("pass");
    if (result.status === "pass")
      expect(result.notices).toEqual([GITLEAKS_MISSING_NOTICE]);
  });

  test("a failed assertion in the real-tree suite is a leak", () => {
    const repo = gateRepo(
      'describe("real tree", () => { test("scan", () => { expect([1]).toEqual([]); }); });',
    );
    expect(checkLeaks(repo, TIMEOUT_MS, undefined).status).toBe("leak");
  });

  test("a throw in the real-tree suite is an error, not a leak", () => {
    const repo = gateRepo(
      'describe("real tree", () => { test("scan", () => { throw new Error("git ls-files failed"); }); });',
    );
    const result = checkLeaks(repo, TIMEOUT_MS, undefined);
    expect(result.status).toBe("error");
    if (result.status === "error")
      expect(result.cause).toContain("git ls-files failed");
  });

  test("a gate without the real-tree suite is an error", () => {
    const repo = gateRepo(
      'describe("renamed", () => { test("scan", () => {}); });',
    );
    const result = checkLeaks(repo, TIMEOUT_MS, undefined);
    expect(result.status).toBe("error");
    if (result.status === "error")
      expect(result.cause).toContain("matched 0 tests");
  });

  test("an import error is an error", () => {
    const repo = gateRepo('import "./does-not-exist";\n' + passing);
    expect(checkLeaks(repo, TIMEOUT_MS, undefined).status).toBe("error");
  });

  test("hands the gitleaks binary to the gate", () => {
    const bin = fakeGitleaks(0);
    const repo = gateRepo(
      `describe("real tree", () => { test("scan", () => { expect(process.env.GITLEAKS_BIN).toBe(${JSON.stringify(bin)}); }); });`,
    );
    expect(checkLeaks(repo, TIMEOUT_MS, bin).status).toBe("pass");
    expect(checkLeaks(repo, TIMEOUT_MS, undefined).status).toBe("leak");
  });

  test.each([
    [0, "pass"],
    [1, "leak"],
    [2, "error"],
  ])("gitleaks exiting %p is %p", (exitCode, status) => {
    const result = checkLeaks(
      gateRepo(passing),
      TIMEOUT_MS,
      fakeGitleaks(exitCode),
    );
    expect(result.status).toBe(status);
  });

  test("a gitleaks that cannot start is an error", () => {
    const result = checkLeaks(
      gateRepo(passing),
      TIMEOUT_MS,
      join(temp(), "nope"),
    );
    expect(result.status).toBe("error");
  });

  test("a gate that runs past the timeout is an error", () => {
    const repo = gateRepo(
      'describe("real tree", () => { test("scan", async () => { await Bun.sleep(5000); }, 10000); });',
    );
    const result = checkLeaks(repo, SHORT_TIMEOUT_MS, undefined);
    expect(result.status).toBe("error");
  });
});

describe("workflow gitleaks pins", () => {
  const REPO_ROOT = join(import.meta.dir, "..", "..");
  const pins = (workflow: string) => {
    const text = readFileSync(
      join(REPO_ROOT, ".github", "workflows", workflow),
      "utf8",
    );
    return ["GITLEAKS_VERSION", "GITLEAKS_SHA256"].map(
      (name) => new RegExp(`${name}: "([^"]+)"`).exec(text)?.[1],
    );
  };

  test("checks.yml installs the same gitleaks release as mirror.yml", () => {
    const mirror = pins("mirror.yml");
    expect(mirror.every((pin) => pin !== undefined)).toBe(true);
    expect(pins("checks.yml")).toEqual(mirror);
  });
});
