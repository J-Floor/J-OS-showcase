import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isExcludedPath, snapshot } from "./snapshot.ts";
import { commitAll, git } from "./test-helpers.ts";

let root: string;
let repoDir: string;
let outDir: string;

const BINARY = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x00, 0x01,
]);

const KEPT: Record<string, Buffer | string> = {
  "docs/README.md": "plain text\n",
  "apps/web/docs/other.md": "other\n",
  "apps/web/AGENTS.md": "kept\n",
  ".github/workflows/checks.yml": "on: push\n",
  "apps/web/logo.png": BINARY,
  "src/index.ts": "export {};\n",
  "apps/web/docs/DEPLOYMENT.md": "nested, kept\n",
};

const REMOVED: Record<string, string> = {
  "docs/superpowers/specs/a.md": "spec\n",
  "apps/web/docs/superpowers/plans/b.md": "plan\n",
  "packages/x/Docs/SuperPowers/c.md": "case variant\n",
  "docs/DEPLOYMENT.md": "runbook\n",
  "AGENTS.md": "agents\n",
  ".claude/settings.json": "{}\n",
  ".claude/skills/x/SKILL.md": "skill\n",
  ".codex/config.toml": "x\n",
  "scripts/agent-guard.ts": "guard\n",
  "scripts/agent-guard.test.ts": "guard test\n",
  ".github/workflows/superpowers-evidence.yml": "on: push\n",
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mirror-snapshot-"));
  repoDir = join(root, "repo");
  outDir = join(root, "out");
  mkdirSync(repoDir, { recursive: true });
  git(repoDir, "init", "-q", "-b", "main");
  commitAll(repoDir, { ...KEPT, ...REMOVED });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("snapshot", () => {
  test("removes every docs/superpowers directory, any case, and the excluded paths, sorted", async () => {
    const { removed } = await snapshot({ repoDir, ref: "HEAD", outDir });
    expect(removed).toEqual([
      ".claude",
      ".codex",
      ".github/workflows/superpowers-evidence.yml",
      "AGENTS.md",
      "apps/web/docs/superpowers",
      "docs/DEPLOYMENT.md",
      "docs/superpowers",
      "packages/x/Docs/SuperPowers",
      "scripts/agent-guard.test.ts",
      "scripts/agent-guard.ts",
    ]);
    expect(existsSync(join(outDir, ".claude"))).toBe(false);
    expect(existsSync(join(outDir, "apps/web/AGENTS.md"))).toBe(true);
    expect(existsSync(join(outDir, ".github/workflows/checks.yml"))).toBe(true);
    expect(existsSync(join(outDir, "docs/DEPLOYMENT.md"))).toBe(false);
    expect(existsSync(join(outDir, "packages/x/Docs"))).toBe(true);
    expect(existsSync(join(outDir, "docs/superpowers"))).toBe(false);
    expect(existsSync(join(outDir, "apps/web/docs/superpowers"))).toBe(false);
  });

  test("keeps every other file byte-identical, binary included", async () => {
    await snapshot({ repoDir, ref: "HEAD", outDir });
    for (const [path, content] of Object.entries(KEPT)) {
      const actual = readFileSync(join(outDir, path));
      expect(actual.equals(Buffer.from(content))).toBe(true);
    }
  });

  test("accepts an existing empty outDir", async () => {
    mkdirSync(outDir);
    const { removed } = await snapshot({ repoDir, ref: "HEAD", outDir });
    expect(removed).toHaveLength(10);
  });

  test("a tree without the excluded paths still snapshots", async () => {
    git(repoDir, "rm", "-q", "docs/DEPLOYMENT.md");
    git(repoDir, "commit", "-q", "-m", "drop runbook");
    const { removed } = await snapshot({ repoDir, ref: "HEAD", outDir });
    expect(removed).not.toContain("docs/DEPLOYMENT.md");
  });

  test("isExcludedPath covers design docs and the excluded paths only", () => {
    expect(isExcludedPath("docs/DEPLOYMENT.md")).toBe(true);
    expect(isExcludedPath("docs/superpowers/specs/a.md")).toBe(true);
    expect(isExcludedPath("apps/web/docs/DEPLOYMENT.md")).toBe(false);
    expect(isExcludedPath("docs/README.md")).toBe(false);
    expect(isExcludedPath(".claude/skills/x/SKILL.md")).toBe(true);
    expect(isExcludedPath("AGENTS.md")).toBe(true);
    expect(isExcludedPath("apps/web/AGENTS.md")).toBe(false);
    expect(isExcludedPath(".claudex/a")).toBe(false);
  });

  test("throws on a bad ref", async () => {
    await expect(
      snapshot({ repoDir, ref: "no-such-ref", outDir }),
    ).rejects.toThrow();
  });

  test("throws on a non-empty outDir and leaves it untouched", async () => {
    mkdirSync(outDir);
    writeFileSync(join(outDir, "stale.txt"), "stale");
    await expect(snapshot({ repoDir, ref: "HEAD", outDir })).rejects.toThrow();
    expect(readFileSync(join(outDir, "stale.txt"), "utf8")).toBe("stale");
  });
});
